import { validDate, shiftDay, parseStart, kstDate, dayEnd, type AgendaItem } from '../app/schedule-utils.ts';
import { ensureScheduleSchema } from './schedule-schema.ts';
import { executePlanCommand, isPlanCommand } from './study-cycle.ts';
import { isReviewRating, publicStudyCard, scheduleReview } from './review.ts';
import type { StudyCardRow } from './types.ts';

export class ScheduleError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
function text(v: unknown, max = 120) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function requestId(v: unknown) { const id = text(v); if (!/^[\w:-]{8,120}$/.test(id)) throw new ScheduleError('요청 ID가 올바르지 않습니다.'); return id; }
function dateInput(v: unknown) { if (!validDate(v)) throw new ScheduleError('날짜가 올바르지 않습니다.'); return v; }
function duration(v: unknown) { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 600) throw new ScheduleError('학습 시간은 1~600분으로 입력하세요.'); return n; }

export async function recoveryPage(db: D1Database, params: URLSearchParams, today = kstDate()) {
  const period = params.get('period') || 'all', language = params.get('language') || 'all', search = (params.get('search') || '').trim().slice(0, 80);
  if (!['all', 'recent', 'medium', 'old', 'archived'].includes(period) || !['all', 'ENGLISH', 'JAPANESE', 'TOEIC'].includes(language)) throw new ScheduleError('필터가 올바르지 않습니다.');
  const where = [period === 'archived' ? "status='archived'" : "status='planned' AND plan_date < ?"], args: (string | number)[] = period === 'archived' ? [] : [today];
  if (period === 'recent') { where.push('plan_date >= ?'); args.push(shiftDay(today, -7)); }
  if (period === 'medium') { where.push('plan_date >= ? AND plan_date < ?'); args.push(shiftDay(today, -21), shiftDay(today, -7)); }
  if (period === 'old') { where.push('plan_date < ?'); args.push(shiftDay(today, -21)); }
  if (language !== 'all') { where.push(language === 'TOEIC' ? "category IN ('TOEIC','LC','RC','VOCA','TEST')" : 'category=?'); if (language !== 'TOEIC') args.push(language); }
  if (search) { where.push('instr(lower(title),lower(?))>0'); args.push(search); }
  const condition = where.join(' AND ');
  const summary = await db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(minutes),0) AS minutes, MIN(plan_date) AS oldest FROM study_plans WHERE ${condition}`).bind(...args).first<{ count: number; minutes: number; oldest: string | null }>();
  const cursor = params.get('cursor');
  if (cursor) { const split = cursor.indexOf('|'); const date = cursor.slice(0, split), id = cursor.slice(split + 1); if (split < 0 || !validDate(date) || !id || id.length > 120) throw new ScheduleError('페이지 위치가 올바르지 않습니다.'); where.push('(plan_date > ? OR (plan_date = ? AND id > ?))'); args.push(date, date, id); }
  const rows = await db.prepare(`SELECT id, plan_date AS planDate, category, title, detail, minutes, status, archive_reason AS archiveReason FROM study_plans WHERE ${where.join(' AND ')} ORDER BY plan_date, id LIMIT 6`).bind(...args).all<{ id: string; planDate: string; category: string; title: string; detail: string; minutes: number; status: string; archiveReason: string }>();
  const items = rows.results.slice(0, 5), last = items.at(-1);
  const totals = await db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(minutes),0) AS minutes FROM study_plans WHERE status='planned' AND plan_date < ?").bind(today).first();
  return { items, summary, totals, nextCursor: rows.results.length > 5 && last ? `${last.planDate}|${last.id}` : null };
}

export async function readSchedule(db: D1Database, params: URLSearchParams, now = new Date()) {
  await ensureScheduleSchema(db);
  const date = dateInput(params.get('date')), from = dateInput(params.get('from')), to = dateInput(params.get('to'));
  if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 42) throw new ScheduleError('달력 조회는 최대 43일입니다.');
  const [plans, sessions, due, settings, cards] = await Promise.all([
    db.prepare(`SELECT p.id,p.plan_date AS date,p.title,p.category,p.minutes,slot.start_minute AS start,p.status,'plan' AS type,p.source_plan_id AS sourcePlanId FROM study_plans p LEFT JOIN study_plan_slots slot ON slot.plan_id=p.id WHERE p.plan_date BETWEEN ? AND ? AND p.status IN ('planned','completed') ORDER BY p.plan_date,slot.start_minute,p.id`).bind(from, to).all<AgendaItem>(),
    db.prepare(`SELECT s.id,s.session_date AS date,'카드 복습' AS title,'REVIEW' AS category,s.minutes,s.start_minute AS start,s.status,'review' AS type,NULL AS sourcePlanId,COUNT(sc.card_id) AS cardCount,COUNT(sc.reviewed_at) AS reviewedCount FROM review_sessions s LEFT JOIN review_session_cards sc ON sc.session_id=s.id WHERE s.session_date BETWEEN ? AND ? AND s.status<>'cancelled' GROUP BY s.id`).bind(from, to).all<AgendaItem>(),
    db.prepare("SELECT date(due,'+9 hours') AS date,COUNT(*) AS count FROM study_cards WHERE due < ? GROUP BY date(due,'+9 hours')").bind(new Date(dayEnd(to)).toISOString()).all<{ date: string; count: number }>(),
    db.prepare("SELECT daily_minutes AS dailyMinutes FROM study_schedule_settings WHERE id='owner'").first<{ dailyMinutes: number }>(),
    db.prepare(`SELECT c.* FROM study_cards c WHERE c.due <= ? AND NOT EXISTS (SELECT 1 FROM review_session_cards sc WHERE sc.card_id=c.id AND sc.active=1) ORDER BY c.due,c.id LIMIT 50`).bind(now.toISOString()).all<StudyCardRow>(),
  ]);
  const items = [...plans.results, ...sessions.results];
  const today = kstDate(now);
  const days = Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 }, (_, i) => {
    const day = shiftDay(from, i), found = items.filter(x => x.date === day);
    return { date: day, count: found.length, completed: found.filter(x => x.status === 'completed').length, minutes: found.reduce((s, x) => s + x.minutes, 0), reviews: found.filter(x => x.type === 'review').length, due: due.results.filter(x => x.date === day || (day === today && x.date < today)).reduce((s, x) => s + x.count, 0) };
  });
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM study_cards c WHERE c.due<=? AND NOT EXISTS (SELECT 1 FROM review_session_cards sc WHERE sc.card_id=c.id AND sc.active=1)`).bind(now.toISOString()).first<{ count: number }>();
  return { days, agenda: items.filter(x => x.date === date).sort((a, b) => (a.start ?? 1440) - (b.start ?? 1440) || a.id.localeCompare(b.id)), dailyMinutes: settings?.dailyMinutes ?? 60, availableCards: cards.results.map(publicStudyCard), availableCount: count?.count ?? 0 };
}

export async function sessionCards(db: D1Database, id: string) {
  const rows = await db.prepare(`SELECT c.*,sc.reviewed_at AS sessionReviewedAt,sc.rating AS sessionRating FROM study_cards c JOIN review_session_cards sc ON sc.card_id=c.id WHERE sc.session_id=? ORDER BY sc.reviewed_at IS NOT NULL,c.due,c.id`).bind(id).all<StudyCardRow & { sessionReviewedAt: string | null; sessionRating: string | null }>();
  return rows.results.map(x => ({ ...publicStudyCard(x), reviewedAt: x.sessionReviewedAt, rating: x.sessionRating }));
}

export async function mutateSchedule(db: D1Database, body: Record<string, unknown>, now = new Date()) {
  await ensureScheduleSchema(db);
  if (body.action === 'budget') {
    const minutes = duration(body.minutes); if (minutes < 10) throw new ScheduleError('하루 목표는 10분 이상으로 입력하세요.');
    await db.prepare("INSERT INTO study_schedule_settings(id,daily_minutes) VALUES('owner',?) ON CONFLICT(id) DO UPDATE SET daily_minutes=excluded.daily_minutes").bind(minutes).run(); return { ok: true };
  }
  if (body.action === 'plan') {
    const id = requestId(body.requestId), planId = text(body.planId);
    if (!isPlanCommand(body.command)) throw new ScheduleError('지원하지 않는 계획 명령입니다.');
    const target = body.command === 'reschedule' ? dateInput(body.date) : null;
    if (target && target < kstDate(now)) throw new ScheduleError('재계획 날짜는 오늘 이후로 선택하세요.');
    return executePlanCommand(db, { requestId: id, planId, command: body.command, targetDate: target, archiveReason: '사용자 보관', scheduleGuard: true, ...(body.command === 'reschedule' ? { startMinute: parseStart(body.time) } : {}) }, now.toISOString());
  }
  const id = requestId(body.requestId), fingerprint = JSON.stringify(body);
  const receipt = await db.prepare('SELECT fingerprint,result_json FROM schedule_receipts WHERE request_id=?').bind(id).first<{ fingerprint: string; result_json: string }>();
  if (receipt) { if (receipt.fingerprint !== fingerprint) throw new ScheduleError('다른 요청에 사용된 ID입니다.', 409); return JSON.parse(receipt.result_json); }
  const result = { ok: true, id }, statements: D1PreparedStatement[] = [];
  if (body.action === 'time') {
    const plan = await db.prepare("SELECT id FROM study_plans WHERE id=? AND status='planned'").bind(text(body.planId)).first();
    if (!plan) throw new ScheduleError('시간을 바꿀 미완료 계획이 없습니다.', 404);
    statements.push(db.prepare('INSERT INTO study_plan_slots(plan_id,start_minute) VALUES(?,?) ON CONFLICT(plan_id) DO UPDATE SET start_minute=excluded.start_minute').bind(text(body.planId), parseStart(body.time)));
  } else if (body.action === 'session-create') {
    const date = dateInput(body.date); if (date < kstDate(now)) throw new ScheduleError('복습 배정일은 오늘 이후로 선택하세요.');
    const ids = Array.isArray(body.cardIds) ? [...new Set(body.cardIds.filter((x): x is string => typeof x === 'string' && x.length <= 120))] : [];
    if (!ids.length || ids.length > 20) throw new ScheduleError('복습 카드는 1~20개 선택하세요.');
    const valid = await db.prepare(`SELECT id FROM study_cards WHERE id IN (${ids.map(() => '?').join(',')}) AND due <= ?`).bind(...ids, now.toISOString()).all();
    if (valid.results.length !== ids.length) throw new ScheduleError('복습 카드 상태가 바뀌었습니다. 새로고침 후 다시 배정하세요.', 409);
    statements.push(db.prepare('INSERT INTO review_sessions(id,session_date,start_minute,minutes,created_at) VALUES(?,?,?,?,?)').bind(id, date, parseStart(body.time), duration(body.minutes), now.toISOString()));
    ids.forEach(card => statements.push(db.prepare('INSERT INTO review_session_cards(session_id,card_id) VALUES(?,?)').bind(id, card)));
  } else if (body.action === 'session-move' || body.action === 'session-cancel') {
    const sessionId = text(body.sessionId);
    const session = await db.prepare("SELECT id FROM review_sessions WHERE id=? AND status='planned'").bind(sessionId).first();
    if (!session) throw new ScheduleError('변경할 복습 일정이 없습니다.', 409);
    if (body.action === 'session-cancel') {
      statements.push(db.prepare("UPDATE review_sessions SET status='cancelled' WHERE id=? AND status='planned'").bind(sessionId), db.prepare('UPDATE review_session_cards SET active=0 WHERE session_id=?').bind(sessionId));
    } else { const date = dateInput(body.date); if (date < kstDate(now)) throw new ScheduleError('오늘 이후 날짜를 선택하세요.'); statements.push(db.prepare("UPDATE review_sessions SET session_date=?,start_minute=? WHERE id=? AND status='planned'").bind(date, parseStart(body.time), sessionId)); }
  } else throw new ScheduleError('지원하지 않는 일정 명령입니다.');
  // D1 batch is transactional: a duplicate assignment or time conflict rolls back the receipt too.
  statements.unshift(db.prepare('INSERT INTO schedule_receipts(request_id,fingerprint,result_json) VALUES(?,?,?)').bind(id, fingerprint, JSON.stringify(result)));
  try { await db.batch(statements); } catch (error) {
    const replay = await db.prepare('SELECT fingerprint,result_json FROM schedule_receipts WHERE request_id=?').bind(id).first<{ fingerprint: string; result_json: string }>();
    if (replay?.fingerprint === fingerprint) return JSON.parse(replay.result_json);
    throw error;
  }
  return result;
}

export async function rateSessionCard(db: D1Database, body: Record<string, unknown>, now = new Date()) {
  const id = requestId(body.requestId), sessionId = text(body.sessionId), cardId = text(body.cardId), rating = body.rating;
  if (!isReviewRating(rating)) throw new ScheduleError('복습 평가가 올바르지 않습니다.');
  async function replay() {
    const prior = await db.prepare('SELECT session_id,card_id,rating,result_json FROM scheduled_review_receipts WHERE request_id=?').bind(id).first<{ session_id: string; card_id: string; rating: string; result_json: string }>();
    if (!prior) return null;
    if (prior.session_id !== sessionId || prior.card_id !== cardId || prior.rating !== rating) throw new ScheduleError('다른 평가에 사용된 ID입니다.', 409);
    return JSON.parse(prior.result_json);
  }
  const prior = await replay(); if (prior) return prior;
  const row = await db.prepare('SELECT * FROM study_cards WHERE id=?').bind(cardId).first<StudyCardRow>();
  if (!row) throw new ScheduleError('복습 카드를 찾을 수 없습니다.', 404);
  const scheduled = scheduleReview(row, rating, now), c = scheduled.card, at = now.toISOString();
  const result = { ok: true, nextDue: c.due.toISOString(), cardId };
  try {
    await db.batch([
      db.prepare('INSERT INTO scheduled_review_receipts(request_id,session_id,card_id,rating,expected_version,result_json) VALUES(?,?,?,?,?,?)').bind(id, sessionId, cardId, rating, row.updated_at, JSON.stringify(result)),
      db.prepare(`UPDATE study_cards SET due=?,stability=?,difficulty=?,elapsed_days=?,scheduled_days=?,learning_steps=?,reps=?,lapses=?,state=?,last_review=?,updated_at=? WHERE id=?`).bind(c.due.toISOString(), c.stability, c.difficulty, c.elapsed_days, c.scheduled_days, c.learning_steps, c.reps, c.lapses, c.state, c.last_review?.toISOString() ?? null, at, cardId),
      db.prepare('INSERT INTO review_logs(id,card_id,rating,reviewed_at,previous_due,next_due,scheduled_days,stability,difficulty,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id, cardId, scheduled.log.rating, at, row.due, c.due.toISOString(), c.scheduled_days, c.stability, c.difficulty, at),
      db.prepare('UPDATE review_session_cards SET reviewed_at=?,rating=?,active=0 WHERE session_id=? AND card_id=?').bind(at, rating, sessionId, cardId),
      db.prepare("UPDATE review_sessions SET status='completed' WHERE id=? AND status='planned' AND NOT EXISTS(SELECT 1 FROM review_session_cards WHERE session_id=? AND reviewed_at IS NULL)").bind(sessionId, sessionId),
    ]);
  } catch (error) { const stored = await replay(); if (stored) return stored; throw error; }
  return result;
}
