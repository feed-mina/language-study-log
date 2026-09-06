import assert from 'node:assert/strict';
import test from 'node:test';

import { Miniflare } from 'miniflare';

import { authorizePrivateCycleIntegration } from '../app/api/integrations/private-cycle/auth.ts';
import {
  ensureStudyCycleSchema,
  executePlanCommand,
  readIntegrationStudy,
  summarizeRecovery,
  type StudyPlanView,
} from './study-cycle.ts';

const now = '2026-09-06T05:00:00.000Z';

function plan(id: string, planDate: string, minutes = 20): StudyPlanView {
  return {
    id,
    planDate,
    category: 'ENGLISH',
    title: id,
    detail: '',
    minutes,
    completed: 0,
    status: 'planned',
    sourcePlanId: null,
    rootPlanId: id,
    updatedAt: now,
    archivedAt: null,
    archiveReason: '',
  };
}

test('recovery summary groups every overdue plan and recommends a bounded oldest-first set', () => {
  const recovery = summarizeRecovery([
    plan('recent', '2026-09-01'),
    plan('medium', '2026-08-20'),
    plan('old', '2026-08-01'),
  ], [plan('archived', '2026-07-01')], '2026-09-06', false);

  assert.equal(recovery.totalCount, 3);
  assert.equal(recovery.totalMinutes, 60);
  assert.equal(recovery.oldestPlanDate, '2026-08-01');
  assert.deepEqual(recovery.recent.map((item) => item.id), ['recent']);
  assert.deepEqual(recovery.medium.map((item) => item.id), ['medium']);
  assert.deepEqual(recovery.old.map((item) => item.id), ['old']);
  assert.deepEqual(recovery.recommended.map((item) => item.id), ['medium', 'recent']);
  assert.deepEqual(recovery.archived.map((item) => item.id), ['archived']);
});

test('recovery suggestions never include plans older than 21 days and respect the day limit', () => {
  const weekday = summarizeRecovery([
    plan('old', '2026-08-01', 10),
    plan('medium', '2026-08-20', 20),
    plan('recent', '2026-09-01', 20),
  ], [], '2026-09-04', false);
  const weekend = summarizeRecovery([
    plan('old', '2026-08-01', 10),
    plan('medium', '2026-08-20', 30),
    plan('recent', '2026-09-01', 30),
  ], [], '2026-09-06', false);
  const busyWeekend = summarizeRecovery([
    plan('medium', '2026-08-20', 20),
    plan('recent', '2026-09-01', 20),
  ], [], '2026-09-06', true);

  assert.deepEqual(weekday.recommended.map((item) => item.id), ['medium']);
  assert.deepEqual(weekend.recommended.map((item) => item.id), ['medium', 'recent']);
  assert.deepEqual(busyWeekend.recommended.map((item) => item.id), ['medium']);
  assert.equal(weekday.recommended.some((item) => item.id === 'old'), false);
  assert.equal(weekend.recommended.some((item) => item.id === 'old'), false);
});

test('integration auth requires its own token and the verified owner header', async () => {
  const config = { integrationToken: 'separate-integration-token', privateOwnerEmail: 'owner@example.com' };
  const allowed = new Request('https://language.example/api/integrations/private-cycle/study', {
    headers: { authorization: 'Bearer separate-integration-token', 'x-private-owner-email': 'OWNER@example.com' },
  });
  const wrongOwner = new Request(allowed, { headers: { authorization: 'Bearer separate-integration-token', 'x-private-owner-email': 'other@example.com' } });
  const adminToken = new Request(allowed, { headers: { authorization: 'Bearer admin-token', 'x-private-owner-email': 'owner@example.com' } });

  assert.deepEqual(await authorizePrivateCycleIntegration(allowed, config), { ok: true });
  assert.equal((await authorizePrivateCycleIntegration(wrongOwner, config)).ok, false);
  assert.equal((await authorizePrivateCycleIntegration(adminToken, config)).ok, false);
  assert.equal((await authorizePrivateCycleIntegration(allowed, {})).ok, false);
});

test('plan commands preserve the linked log, root plan, history, archive state, and idempotency', async (context) => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    compatibilityDate: '2026-05-22',
    d1Databases: ['DB'],
  });
  context.after(() => mf.dispose());
  const database = await mf.getD1Database('DB');
  await ensureStudyCycleSchema(database);
  await database.prepare(`INSERT INTO study_plans
    (id, plan_date, category, title, detail, minutes, completed, source_plan_id, status, root_plan_id, created_at, updated_at, archived_at, archive_reason)
    VALUES ('plan-1', '2026-09-01', 'ENGLISH', 'Practice', '', 25, 0, NULL, 'planned', 'plan-1', ?, ?, NULL, '')`)
    .bind(now, now).run();

  const completed = await executePlanCommand(database, {
    requestId: 'request:complete:1', command: 'complete', planId: 'plan-1', minutes: 30, note: 'done',
  }, now);
  assert.equal(completed.plan.status, 'completed');
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM study_logs WHERE id = 'log:plan:plan-1' AND source_type = 'plan'").first<{ count: number }>())?.count, 1);

  const replayed = await executePlanCommand(database, {
    requestId: 'request:complete:1', command: 'complete', planId: 'plan-1', minutes: 30, note: 'done',
  }, now);
  assert.equal(replayed.replayed, true);
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM study_plan_events WHERE idempotency_key = 'request:complete:1'").first<{ count: number }>())?.count, 1);

  await executePlanCommand(database, { requestId: 'request:undo:0001', command: 'undo-complete', planId: 'plan-1' }, now);
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM study_logs WHERE id = 'log:plan:plan-1'").first<{ count: number }>())?.count, 0);

  const rescheduled = await executePlanCommand(database, {
    requestId: 'request:reschedule:1', command: 'reschedule', planId: 'plan-1', targetDate: '2026-09-08',
  }, now);
  assert.equal(rescheduled.plan.status, 'rescheduled');
  assert.equal(rescheduled.createdPlan?.rootPlanId, 'plan-1');
  assert.equal(rescheduled.createdPlan?.sourcePlanId, 'plan-1');

  const childId = rescheduled.createdPlan!.id;
  await executePlanCommand(database, { requestId: 'request:archive:01', command: 'archive', planId: childId, archiveReason: 'later' }, now);
  const restored = await executePlanCommand(database, { requestId: 'request:restore:01', command: 'restore', planId: childId }, now);
  assert.equal(restored.plan.status, 'planned');
  assert.equal(restored.plan.archivedAt, null);

  const view = await readIntegrationStudy(database, '2026-09-09');
  assert.equal(view.recovery.totalCount, 1);
  assert.equal(view.recovery.oldestPlanDate, '2026-09-08');
});

test('integration records resolve original material links through a rescheduled root plan', async (context) => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    compatibilityDate: '2026-05-22',
    d1Databases: ['DB'],
  });
  context.after(() => mf.dispose());
  const database = await mf.getD1Database('DB');
  await ensureStudyCycleSchema(database);

  const materialId = 'content:chatgpt:2026-08-25:english';
  const rootPlanId = `content:${materialId}`;
  await database.batch([
    database.prepare(`INSERT INTO study_content
      (id, content_date, kind, title, summary, body_json, model, status, created_at, updated_at)
      VALUES (?, '2026-08-25', 'english', 'Original material', '', '{}', 'test', 'ready', ?, ?)`).bind(materialId, now, now),
    database.prepare(`INSERT INTO study_plans
      (id, plan_date, category, title, detail, minutes, completed, source_plan_id, status, root_plan_id, created_at, updated_at, archived_at, archive_reason)
      VALUES (?, '2026-08-25', 'ENGLISH', 'Original material', '', 20, 2, NULL, 'rescheduled', ?, ?, ?, NULL, '')`).bind(rootPlanId, rootPlanId, now, now),
    database.prepare(`INSERT INTO study_plans
      (id, plan_date, category, title, detail, minutes, completed, source_plan_id, status, root_plan_id, created_at, updated_at, archived_at, archive_reason)
      VALUES ('child-plan', '2026-09-08', 'ENGLISH', 'Original material', '', 20, 0, ?, 'planned', ?, ?, ?, NULL, '')`).bind(rootPlanId, rootPlanId, now, now),
    database.prepare(`INSERT INTO study_logs
      (id, study_date, part, title, minutes, score, note, source_type, source_id, source_label, confused_items, created_at)
      VALUES ('direct-material-log', '2026-09-08', 'ENGLISH', 'Direct completion', 20, '', '', 'material', ?, 'Original material', '', ?)`).bind(materialId, now),
  ]);

  const linked = await database.prepare(`SELECT plans.root_plan_id, substr(plans.root_plan_id, 9) AS candidate_id,
      material.id AS material_id, material.content_date AS material_date
    FROM study_plans AS plans
    LEFT JOIN study_content AS material ON material.id = substr(plans.root_plan_id, 9)
    WHERE plans.id = 'child-plan'`).first<{ root_plan_id: string; candidate_id: string; material_id: string; material_date: string }>();
  assert.deepEqual(linked, { root_plan_id: rootPlanId, candidate_id: materialId, material_id: materialId, material_date: '2026-08-25' });

  const completed = await executePlanCommand(database, {
    requestId: 'request:material:complete', command: 'complete', planId: 'child-plan',
  }, now);
  const replayed = await executePlanCommand(database, {
    requestId: 'request:material:complete', command: 'complete', planId: 'child-plan',
  }, now);
  const expectedPath = '/?date=2026-08-25&material=content%3Achatgpt%3A2026-08-25%3Aenglish';

  assert.equal(completed.plan.materialId, materialId);
  assert.equal(completed.plan.openPath, expectedPath);
  assert.equal(replayed.plan.materialId, materialId);
  assert.equal(replayed.plan.openPath, expectedPath);

  const view = await readIntegrationStudy(database, '2026-09-08');
  assert.equal(view.todayPlans[0]?.materialId, materialId);
  assert.equal(view.todayPlans[0]?.openPath, expectedPath);
  assert.equal(view.completedLogs.length, 2);
  assert.ok(view.completedLogs.every((log) => log.materialId === materialId));
  assert.ok(view.completedLogs.every((log) => log.openPath === expectedPath));
});
