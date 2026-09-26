import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Miniflare } from 'miniflare';

import { ensureRestartSchema } from './restart-cycle.ts';
import { listArchiveBatches, listStudyLibrary, restoreArchiveBatch } from './study-library.ts';
import { ensureStudyCycleSchema, StudyCycleError } from './study-cycle.ts';

async function database(context: TestContext) {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch(){ return new Response("ok") } }', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
  context.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await ensureStudyCycleSchema(db); await ensureRestartSchema(db);
  await db.prepare(`CREATE TABLE study_assets (id TEXT PRIMARY KEY,content_id TEXT,kind TEXT NOT NULL,r2_key TEXT NOT NULL,filename TEXT NOT NULL,content_type TEXT NOT NULL,bytes INTEGER NOT NULL,created_at TEXT NOT NULL)`).run();
  return db;
}

test('자료함은 언어·상태·날짜·본문 검색을 함께 적용하고 원본 열기 경로를 돌려준다', async context => {
  const db = await database(context); const now = '2026-09-26T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO study_content(id,content_date,kind,title,summary,body_json,model,status,created_at,updated_at) VALUES('en-1','2026-09-01','english','회의 영어','경보 점검','{"items":[{"prompt":"rollback"}]}','test','completed',?,?)`).bind(now, now),
    db.prepare(`INSERT INTO study_content(id,content_date,kind,title,summary,body_json,model,status,created_at,updated_at) VALUES('ja-1','2026-09-02','japanese','첫 일본어','인사','{}','test','ready',?,?)`).bind(now, now),
    db.prepare(`INSERT INTO study_assets(id,content_id,kind,r2_key,filename,content_type,bytes,created_at) VALUES('asset-1','en-1','audio','a','a.mp3','audio/mpeg',10,?)`).bind(now),
  ]);
  const result = await listStudyLibrary(db, { kind: 'english', status: 'completed', search: 'rollback', from: '2026-09-01', to: '2026-09-30' });
  assert.equal(result.total, 1); assert.equal(result.items[0].assetCount, 1);
  assert.equal(result.items[0].openPath, '/?date=2026-09-01&material=en-1');
});

test('보관 묶음 복원은 계획만 되돌리고 새 회차를 유지하며 같은 요청은 재생한다', async context => {
  const db = await database(context); const now = '2026-09-26T00:00:00.000Z';
  await db.batch([
    db.prepare(`INSERT INTO study_cycles(id,language,curriculum_version,start_step,state,daily_minutes,started_on,created_at,updated_at) VALUES('cycle-en','ENGLISH','beginner-v1',1,'active',20,'2026-09-26',?,?)`).bind(now, now),
    db.prepare(`INSERT INTO study_archive_batches(id,request_id,snapshot_token,backlog_count,replaced_today_count,total_minutes,reason,result_json,created_at) VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','restart:test','snap',2,0,40,'재시작','{}',?)`).bind(now),
    db.prepare(`INSERT INTO study_plans(id,plan_date,category,title,detail,minutes,completed,status,root_plan_id,created_at,updated_at,archived_at,archive_reason,archive_batch_id) VALUES('old-en','2026-09-01','ENGLISH','old en','',20,0,'archived','old-en',?,?,?,'재시작','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')`).bind(now, now, now),
    db.prepare(`INSERT INTO study_plans(id,plan_date,category,title,detail,minutes,completed,status,root_plan_id,created_at,updated_at,archived_at,archive_reason,archive_batch_id) VALUES('old-ja','2026-09-02','JAPANESE','old ja','',20,0,'archived','old-ja',?,?,?,'재시작','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')`).bind(now, now, now),
    db.prepare(`INSERT INTO study_archive_batch_items(batch_id,plan_id,item_scope) VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','old-en','backlog'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','old-ja','backlog')`),
  ]);
  const input = { batchId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', requestId: 'restore:test:0001', confirmed: true };
  const result = await restoreArchiveBatch(db, input, '2026-09-26T01:00:00.000Z');
  assert.equal(result.restoredCount, 2);
  assert.equal((await db.prepare("SELECT COUNT(*) count FROM study_plans WHERE status='planned' AND id LIKE 'old-%'").first<{ count: number }>())?.count, 2);
  assert.equal((await db.prepare("SELECT state FROM study_cycles WHERE id='cycle-en'").first<{ state: string }>())?.state, 'active');
  assert.equal((await restoreArchiveBatch(db, input)).replayed, true);
  assert.equal((await listArchiveBatches(db))[0].canRestore, false);
});

test('묶음 복원은 날짜별 40분을 넘기기 전에 전체를 중단한다', async context => {
  const db = await database(context); const now = '2026-09-26T00:00:00.000Z'; const batch = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  await db.batch([
    db.prepare(`INSERT INTO study_archive_batches(id,request_id,snapshot_token,backlog_count,replaced_today_count,total_minutes,reason,result_json,created_at) VALUES(?,'restart:limit','snap',1,0,20,'재시작','{}',?)`).bind(batch, now),
    db.prepare(`INSERT INTO study_plans(id,plan_date,category,title,detail,minutes,completed,status,root_plan_id,created_at,updated_at,archived_at,archive_reason,archive_batch_id) VALUES('archived','2026-09-01','ENGLISH','archived','',20,0,'archived','archived',?,?,?,'재시작',?)`).bind(now, now, now, batch),
    db.prepare(`INSERT INTO study_plans(id,plan_date,category,title,detail,minutes,completed,status,root_plan_id,created_at,updated_at,archive_reason) VALUES('active','2026-09-01','JAPANESE','active','',30,0,'planned','active',?,?,'')`).bind(now, now),
    db.prepare(`INSERT INTO study_archive_batch_items(batch_id,plan_id,item_scope) VALUES(?,'archived','backlog')`).bind(batch),
  ]);
  await assert.rejects(() => restoreArchiveBatch(db, { batchId: batch, requestId: 'restore:limit:1', confirmed: true }), (error: unknown) => error instanceof StudyCycleError && error.code === 'RESTORE_DAILY_LIMIT_EXCEEDED');
  assert.equal((await db.prepare("SELECT status FROM study_plans WHERE id='archived'").first<{ status: string }>())?.status, 'archived');
});
