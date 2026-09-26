import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { Miniflare } from 'miniflare';

import { ensureStudyCycleSchema, StudyCycleError } from './study-cycle.ts';
import { executeStudyRestart, previewStudyRestart, trackAllowsPlan, validateDailyMinutes } from './restart-cycle.ts';

const now = '2026-09-26T05:00:00.000Z';

async function testDatabase(context: TestContext) {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    compatibilityDate: '2026-05-22',
    d1Databases: ['DB'],
  });
  context.after(() => mf.dispose());
  const database = await mf.getD1Database('DB');
  await ensureStudyCycleSchema(database);
  return database;
}

test('preview and confirmed restart archive the snapshot, preserve material rows, create 40 minute cycles, and pause TOEIC', async (context) => {
  const database = await testDatabase(context);
  await database.batch([
    database.prepare(`INSERT INTO study_content
      (id, content_date, kind, title, summary, body_json, model, status, created_at, updated_at)
      VALUES ('material-old', '2026-08-27', 'english', 'Old material', '', '{}', 'test', 'ready', ?, ?)`).bind(now, now),
    database.prepare(`INSERT INTO study_plans
      (id, plan_date, category, title, detail, minutes, completed, source_plan_id, status, root_plan_id, created_at, updated_at, archived_at, archive_reason)
      VALUES ('content:material-old', '2026-08-27', 'ENGLISH', 'Old material', '', 20, 0, NULL, 'planned', 'content:material-old', ?, ?, NULL, '')`).bind(now, now),
    database.prepare(`INSERT INTO study_plans
      (id, plan_date, category, title, detail, minutes, completed, source_plan_id, status, root_plan_id, created_at, updated_at, archived_at, archive_reason)
      VALUES ('today-toeic', '2026-09-26', 'TOEIC', 'Today TOEIC', '', 45, 0, NULL, 'planned', 'today-toeic', ?, ?, NULL, '')`).bind(now, now),
  ]);

  const preview = await previewStudyRestart(database, '2026-09-26');
  assert.equal(preview.backlogCount, 1);
  assert.equal(preview.todayReplaceCount, 1);
  assert.equal(preview.archiveCount, 2);
  assert.equal(preview.dailyLimitMinutes, 40);

  const result = await executeStudyRestart(database, {
    requestId: 'restart:20260926:0001', restartDate: '2026-09-26', expectedBacklogCount: 1,
    snapshotToken: preview.snapshotToken, confirmed: true,
  }, now);
  assert.equal(result.ok, true);
  assert.equal(result.replayed, false);
  assert.equal((await database.prepare("SELECT COUNT(*) count FROM study_plans WHERE status='archived' AND archive_batch_id=?").bind(result.batchId).first<{ count: number }>())?.count, 2);
  assert.equal((await database.prepare("SELECT COALESCE(SUM(minutes),0) minutes FROM study_plans WHERE plan_date='2026-09-26' AND status='planned'").first<{ minutes: number }>())?.minutes, 40);
  assert.equal((await database.prepare("SELECT state FROM study_track_settings WHERE language='TOEIC'").first<{ state: string }>())?.state, 'paused');
  assert.equal((await database.prepare("SELECT COUNT(*) count FROM study_content WHERE id='material-old'").first<{ count: number }>())?.count, 1);
  assert.equal((await database.prepare("SELECT COUNT(*) count FROM study_archive_batch_items WHERE plan_id='content:material-old'").first<{ count: number }>())?.count, 1);
  assert.equal(await trackAllowsPlan(database, 'TOEIC', '2026-09-27', 45), false);

  const replay = await executeStudyRestart(database, {
    requestId: 'restart:20260926:0001', restartDate: '2026-09-26', expectedBacklogCount: 1,
    snapshotToken: preview.snapshotToken, confirmed: true,
  }, now);
  assert.equal(replay.replayed, true);
});

test('restart refuses stale previews, missing confirmation, and plans above 40 minutes', async (context) => {
  const database = await testDatabase(context);
  const preview = await previewStudyRestart(database, '2026-09-26');
  await assert.rejects(() => executeStudyRestart(database, {
    requestId: 'restart:missing:confirm', restartDate: '2026-09-26', expectedBacklogCount: 0,
    snapshotToken: preview.snapshotToken, confirmed: false,
  }, now), (error: unknown) => error instanceof StudyCycleError && error.code === 'CONFIRMATION_REQUIRED');
  await assert.rejects(() => executeStudyRestart(database, {
    requestId: 'restart:stale:0001', restartDate: '2026-09-26', expectedBacklogCount: 1,
    snapshotToken: preview.snapshotToken, confirmed: true,
  }, now), (error: unknown) => error instanceof StudyCycleError && error.code === 'RESTART_PREVIEW_CHANGED');
  assert.throws(() => validateDailyMinutes([20, 21]), (error: unknown) => error instanceof StudyCycleError && error.code === 'DAILY_LIMIT_EXCEEDED');
});
