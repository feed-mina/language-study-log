import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import { calendarDays, parseStart, kstDate, validDate } from '../app/schedule-utils.ts';
import { ensureScheduleSchema, scheduleSchema } from './schedule-schema.ts';
import { mutateSchedule, rateSessionCard, readSchedule, recoveryPage } from './study-schedule.ts';

test('migration and runtime guards avoid remote D1 CASE/END splitting and use identical SQL', () => {
  const sql = readFileSync(new URL('../drizzle/0007_study_schedule.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /\r/);
  assert.doesNotMatch(sql, /\bCASE\b(?=\s+WHEN)/i);
  const statements = unstable_splitSqlQuery(sql);
  const normalize = (value: string) => value.trim().replace(/;$/, '').replace(/\s+/g, ' ');
  assert.deepEqual(statements.map(normalize), scheduleSchema.map(normalize));
});

test('calendar keeps KST boundaries, Monday grids, leap days and strict times', () => {
  assert.equal(kstDate(new Date('2026-09-10T15:00:00Z')), '2026-09-11');
  assert.equal(calendarDays('2028-02-29', 'month').length, 42);
  assert.equal(calendarDays('2028-02-29', 'week')[0], '2028-02-28');
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(parseStart('00:00'), 0); assert.equal(parseStart(''), null);
  assert.throws(() => parseStart('24:00')); assert.throws(() => parseStart('9:00'));
});

test('schedule persists paging, time conflicts, replan history and atomic review retries', async context => {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok"); } }', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
  context.after(() => mf.dispose()); const db = await mf.getD1Database('DB');
  const migrations = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(migrations).filter(x => x.endsWith('.sql')).sort()) {
    const statements = unstable_splitSqlQuery(readFileSync(new URL(file, migrations), 'utf8'));
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
  await ensureScheduleSchema(db); await ensureScheduleSchema(db);
  const now = new Date('2026-09-11T01:00:00.000Z');
  for (let i = 0; i < 105; i++) await db.prepare(`INSERT INTO study_plans(id,plan_date,category,title,detail,minutes,status,root_plan_id,created_at,updated_at) VALUES(?,?,?,?,?,20,'planned',?,?,?)`).bind(`p${String(i).padStart(3, '0')}`, '2026-09-05', i % 2 ? 'ENGLISH' : 'JAPANESE', `공부 ${i}`, '내용', `p${String(i).padStart(3, '0')}`, now.toISOString(), now.toISOString()).run();
  let cursor = ''; const ids: string[] = [];
  do { const result = await recoveryPage(db, new URLSearchParams({ cursor }), '2026-09-11'); assert.equal(result.summary?.count, 105); assert.ok(result.items.length <= 5); ids.push(...result.items.map(x => x.id)); cursor = result.nextCursor ?? ''; } while (cursor);
  assert.equal(new Set(ids).size, 105);
  assert.equal((await recoveryPage(db, new URLSearchParams({ search: '%' }), '2026-09-11')).items.length, 0);
  assert.equal((await recoveryPage(db, new URLSearchParams({ period: 'old' }), '2026-09-11')).summary?.count, 0);
  await db.prepare("UPDATE study_plans SET updated_at='' WHERE id='p000'").run();
  const first = { action: 'plan', command: 'reschedule', requestId: 'test:replan:001', planId: 'p000', date: '2026-09-11', time: '09:00' };
  const moved = await mutateSchedule(db, first, now);
  await mutateSchedule(db, first, now);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM study_plans WHERE source_plan_id='p000'").first<{ n: number }>())?.n, 1);
  assert.equal((await db.prepare("SELECT status FROM study_plans WHERE id='p000'").first<{ status: string }>())?.status, 'rescheduled');
  await assert.rejects(mutateSchedule(db, { ...first, planId: 'p001', requestId: 'test:replan:002' }, now), /TIME_CONFLICT/);
  assert.equal((await db.prepare("SELECT status FROM study_plans WHERE id='p001'").first<{ status: string }>())?.status, 'planned');
  await assert.rejects(mutateSchedule(db, { ...first, planId: 'p001', requestId: 'test:replan:003', time: '23:59' }, now));
  assert.ok(moved);
  const simultaneous = await Promise.allSettled([
    mutateSchedule(db, { ...first, planId: 'p004', requestId: 'parallel:plan:1', time: '12:00' }, now),
    mutateSchedule(db, { ...first, planId: 'p004', requestId: 'parallel:plan:2', time: '13:00' }, now),
  ]);
  assert.equal(simultaneous.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM study_plans WHERE source_plan_id='p004'").first<{ n: number }>())?.n, 1);
  const cardSql = `INSERT INTO study_cards(id,language,category,prompt,answer,due,created_at,updated_at) VALUES(?,'english','review',?,'정답',?,?,?)`;
  for (const id of ['c1', 'c2', 'c3']) await db.prepare(cardSql).bind(id, id, '2026-09-10T15:00:00.000Z', now.toISOString(), now.toISOString()).run();
  await db.prepare(cardSql).bind('future', 'future', '2026-09-12T15:00:00.000Z', now.toISOString(), now.toISOString()).run();
  const create = { action: 'session-create', requestId: 'session:test:1', date: '2026-09-11', time: '10:00', minutes: 10, cardIds: ['c1', 'c2'] };
  await mutateSchedule(db, create, now); await mutateSchedule(db, create, now);
  await assert.rejects(mutateSchedule(db, { ...create, requestId: 'session:test:2', time: '11:00' }, now), /UNIQUE/);
  assert.equal(await db.prepare("SELECT id FROM review_sessions WHERE id='session:test:2'").first(), null);
  const payload = await readSchedule(db, new URLSearchParams({ date: '2026-09-11', from: '2026-09-07', to: '2026-09-13' }), now);
  assert.equal(payload.agenda.length, 3); assert.equal(payload.availableCount, 1);
  assert.equal(payload.days.find(x => x.date === '2026-09-13')?.due, 1);
  const rate = { action: 'rate', requestId: 'rating:test:1', sessionId: 'session:test:1', cardId: 'c1', rating: 'good' };
  const results = await Promise.all([rateSessionCard(db, rate, now), rateSessionCard(db, rate, now)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal((await db.prepare("SELECT reps FROM study_cards WHERE id='c1'").first<{ reps: number }>())?.reps, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM review_logs WHERE card_id='c1'").first<{ n: number }>())?.n, 1);
  await assert.rejects(rateSessionCard(db, { ...rate, requestId: 'rating:test:other' }, now), /REVIEW_CONFLICT/);
  await rateSessionCard(db, { ...rate, requestId: 'rating:test:2', cardId: 'c2', rating: 'hard' }, now);
  assert.equal((await db.prepare("SELECT status FROM review_sessions WHERE id='session:test:1'").first<{ status: string }>())?.status, 'completed');
  await assert.rejects(mutateSchedule(db, { action: 'session-move', requestId: 'move:completed:1', sessionId: 'session:test:1', date: '2026-09-12', time: '' }, now));
  await mutateSchedule(db, { ...create, requestId: 'session:cancel:1', cardIds: ['c3'], time: '' }, now);
  await mutateSchedule(db, { action: 'session-cancel', requestId: 'cancel:test:001', sessionId: 'session:cancel:1' }, now);
  assert.equal((await db.prepare("SELECT active FROM review_session_cards WHERE card_id='c3'").first<{ active: number }>())?.active, 0);
  await mutateSchedule(db, { action: 'budget', minutes: 90 }, now);
  assert.equal((await readSchedule(db, new URLSearchParams({ date: '2026-09-11', from: '2026-09-07', to: '2026-09-13' }), now)).dailyMinutes, 90);
});
