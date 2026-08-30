import { env } from 'cloudflare:workers';

import { isAuthorizedDashboardMutation } from './auth';

export const runtime = 'edge';

type Row = Record<string, string | number | null>;
type PlanRow = Row & {
  id: string;
  plan_date: string;
  category: string;
  title: string;
  detail: string;
  minutes: number;
  completed: number;
  source_plan_id: string | null;
  created_at: string;
};

function db() {
  return (env as Cloudflare.Env & { DB: D1Database }).DB;
}

function canMutate(request: Request) {
  const workerEnv = env as Cloudflare.Env & {
    ADMIN_TOKEN?: string;
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
  };
  return isAuthorizedDashboardMutation(request, {
    adminToken: workerEnv.ADMIN_TOKEN,
    accessTeamDomain: workerEnv.ACCESS_TEAM_DOMAIN,
    accessAud: workerEnv.ACCESS_AUD,
  });
}

function unauthorized() {
  return Response.json({ error: 'Cloudflare Access login required' }, { status: 401, headers: { 'cache-control': 'no-store' } });
}

async function ensureSchema() {
  const database = db();
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS study_plans (
      id TEXT PRIMARY KEY, plan_date TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '', minutes INTEGER NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      source_plan_id TEXT, created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS study_logs (
      id TEXT PRIMARY KEY, study_date TEXT NOT NULL, part TEXT NOT NULL, title TEXT NOT NULL,
      minutes INTEGER NOT NULL, score TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'legacy', source_id TEXT, source_label TEXT NOT NULL DEFAULT '',
      confused_items TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS study_goals (
      id TEXT PRIMARY KEY, target_score INTEGER NOT NULL, exam_date TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS toeic_scores (
      id TEXT PRIMARY KEY, score INTEGER NOT NULL, score_date TEXT NOT NULL, score_type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    )`),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_plans_date ON study_plans(plan_date)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_logs_date ON study_logs(study_date)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_logs_source ON study_logs(source_type, source_id)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_toeic_scores_date ON toeic_scores(score_date, created_at)'),
  ]);
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function minutes(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(600, Math.max(1, Math.round(number))) : 1;
}

function scoreNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 990 ? number : null;
}

function categoryForMaterial(kind: string): string {
  if (kind === 'english') return 'ENGLISH';
  if (kind === 'japanese') return 'JAPANESE';
  return 'TOEIC';
}

function mapPlan(row: Row) {
  return {
    id: row.id, planDate: row.plan_date, category: row.category, title: row.title,
    detail: row.detail, minutes: row.minutes, completed: row.completed, sourcePlanId: row.source_plan_id,
  };
}

function mapLog(row: Row) {
  return {
    id: row.id, studyDate: row.study_date, part: row.part, title: row.title, minutes: row.minutes,
    score: row.score, note: row.note, sourceType: row.source_type, sourceId: row.source_id,
    sourceLabel: row.source_label, confusedItems: row.confused_items, createdAt: row.created_at,
  };
}

export async function GET(request: Request) {
  await ensureSchema();
  const url = new URL(request.url);
  const fallbackDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const date = validDate(url.searchParams.get('date')) ? url.searchParams.get('date')! : fallbackDate;
  const calendarStart = validDate(url.searchParams.get('calendarStart')) ? url.searchParams.get('calendarStart')! : date;
  const calendarEnd = validDate(url.searchParams.get('calendarEnd')) ? url.searchParams.get('calendarEnd')! : date;
  const logStart = validDate(url.searchParams.get('logStart')) ? url.searchParams.get('logStart')! : (validDate(url.searchParams.get('start')) ? url.searchParams.get('start')! : calendarStart);
  const logEnd = validDate(url.searchParams.get('logEnd')) ? url.searchParams.get('logEnd')! : (validDate(url.searchParams.get('end')) ? url.searchParams.get('end')! : calendarEnd);
  const database = db();
  const [plansResult, overdueResult, logsResult, datesResult, legacyResult, goalResult, latestScore, reviewResult] = await Promise.all([
    database.prepare('SELECT * FROM study_plans WHERE plan_date = ? ORDER BY created_at ASC').bind(date).all<Row>(),
    database.prepare(`SELECT * FROM study_plans WHERE plan_date < ? AND completed = 0
      ORDER BY plan_date DESC, created_at ASC LIMIT 7`).bind(date).all<Row>(),
    database.prepare(`SELECT * FROM study_logs WHERE study_date BETWEEN ? AND ? AND source_type <> 'legacy'
      ORDER BY study_date ASC, created_at ASC`).bind(logStart, logEnd).all<Row>(),
    database.prepare(`SELECT study_date AS date FROM study_logs
      WHERE study_date BETWEEN ? AND ? AND source_type <> 'legacy'
      UNION SELECT plan_date AS date FROM study_plans
      WHERE completed = 1 AND plan_date BETWEEN ? AND ?`).bind(calendarStart, calendarEnd, calendarStart, calendarEnd).all<{ date: string }>(),
    database.prepare("SELECT COUNT(*) AS count FROM study_logs WHERE source_type = 'legacy'").first<{ count: number }>(),
    database.prepare("SELECT * FROM study_goals WHERE id = 'toeic' LIMIT 1").first<Row>(),
    database.prepare('SELECT * FROM toeic_scores ORDER BY score_date DESC, created_at DESC LIMIT 1').first<Row>(),
    database.prepare(`SELECT title, study_date, note, confused_items FROM study_logs
      WHERE study_date <= ? AND source_type <> 'legacy' AND (note <> '' OR confused_items <> '')
      ORDER BY study_date DESC, created_at DESC LIMIT 5`).bind(date).all<Row>(),
  ]);

  return Response.json({
    plans: (plansResult.results ?? []).map(mapPlan),
    overduePlans: (overdueResult.results ?? []).map(mapPlan),
    logs: (logsResult.results ?? []).map(mapLog),
    completedDates: (datesResult.results ?? []).map((row) => row.date),
    legacyLogsCount: legacyResult?.count ?? 0,
    goal: goalResult ? { targetScore: goalResult.target_score, examDate: goalResult.exam_date, updatedAt: goalResult.updated_at } : null,
    latestScore: latestScore ? { score: latestScore.score, scoreDate: latestScore.score_date, scoreType: latestScore.score_type, source: latestScore.source } : null,
    reviewNotes: (reviewResult.results ?? []).map((row) => ({ title: row.title, studyDate: row.study_date, note: row.note, confusedItems: row.confused_items })),
  });
}

export async function POST(request: Request) {
  if (!(await canMutate(request))) return unauthorized();
  await ensureSchema();
  const body = await request.json() as Record<string, unknown>;
  const database = db();
  const now = new Date().toISOString();

  if (body.kind === 'log' || body.kind === 'external-log') {
    if (!validDate(body.studyDate) || !text(body.title, 80)) return Response.json({ error: 'invalid input' }, { status: 400 });
    await database.prepare(`INSERT INTO study_logs
      (id, study_date, part, title, minutes, score, note, source_type, source_id, source_label, confused_items, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'external', NULL, '사이트 밖 학습', ?, ?)`)
      .bind(crypto.randomUUID(), body.studyDate, text(body.part, 12) || 'OTHER', text(body.title, 80), minutes(body.minutes), text(body.score, 30), text(body.note, 300), text(body.confusedItems, 300), now).run();
  } else if (body.kind === 'plan') {
    if (!validDate(body.planDate) || !text(body.title, 80)) return Response.json({ error: 'invalid input' }, { status: 400 });
    await database.prepare(`INSERT INTO study_plans
      (id, plan_date, category, title, detail, minutes, completed, source_plan_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)`)
      .bind(crypto.randomUUID(), body.planDate, text(body.category, 12), text(body.title, 80), text(body.detail, 120), minutes(body.minutes), now).run();
  } else if (body.kind === 'goal') {
    const targetScore = scoreNumber(body.targetScore);
    if (targetScore === null || !validDate(body.examDate)) return Response.json({ error: 'invalid goal' }, { status: 400 });
    const statements = [database.prepare(`INSERT INTO study_goals (id, target_score, exam_date, updated_at)
      VALUES ('toeic', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET target_score = excluded.target_score,
      exam_date = excluded.exam_date, updated_at = excluded.updated_at`).bind(targetScore, body.examDate, now)];
    const latest = scoreNumber(body.latestScore);
    if (latest !== null) {
      if (!validDate(body.scoreDate)) return Response.json({ error: 'invalid score date' }, { status: 400 });
      statements.push(database.prepare(`INSERT INTO toeic_scores
        (id, score, score_date, score_type, source, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), latest, body.scoreDate, text(body.scoreType, 30) || 'official', text(body.scoreSource, 80), now));
    }
    await database.batch(statements);
  } else if (body.kind === 'material-completion') {
    const materialId = text(body.materialId, 80);
    if (!materialId || !validDate(body.studyDate)) return Response.json({ error: 'invalid material completion' }, { status: 400 });
    const material = await database.prepare('SELECT id, kind, title FROM study_content WHERE id = ? LIMIT 1').bind(materialId).first<{ id: string; kind: string; title: string }>();
    if (!material) return Response.json({ error: 'material not found' }, { status: 404 });
    const logId = `log:material:${material.id}`;
    await database.batch([
      database.prepare("UPDATE study_content SET status = 'completed', updated_at = ? WHERE id = ?").bind(now, material.id),
      database.prepare('UPDATE study_plans SET completed = 1 WHERE id = ?').bind(`content:${material.id}`),
      database.prepare(`INSERT INTO study_logs
        (id, study_date, part, title, minutes, score, note, source_type, source_id, source_label, confused_items, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'material', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET study_date = excluded.study_date, minutes = excluded.minutes,
          score = excluded.score, note = excluded.note, confused_items = excluded.confused_items, created_at = excluded.created_at`)
        .bind(logId, body.studyDate, categoryForMaterial(material.kind), material.title, minutes(body.minutes), text(body.score, 30), text(body.note, 300), material.id, material.title, text(body.confusedItems, 300), now),
    ]);
  } else {
    return Response.json({ error: 'invalid kind' }, { status: 400 });
  }
  return Response.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!(await canMutate(request))) return unauthorized();
  await ensureSchema();
  const body = await request.json() as Record<string, unknown>;
  const id = text(body.id, 80);
  if (!id) return Response.json({ error: 'invalid id' }, { status: 400 });
  const database = db();
  const now = new Date().toISOString();

  if (body.action === 'material-start') {
    const result = await database.prepare("UPDATE study_content SET status = 'in_progress', updated_at = ? WHERE id = ? AND status <> 'completed'").bind(now, id).run();
    return Response.json({ ok: (result.meta.changes ?? 0) > 0 });
  }

  const plan = await database.prepare('SELECT * FROM study_plans WHERE id = ? LIMIT 1').bind(id).first<PlanRow>();
  if (!plan) return Response.json({ error: 'plan not found' }, { status: 404 });

  if (body.action === 'reschedule') {
    if (!validDate(body.planDate) || body.planDate === plan.plan_date || plan.completed !== 0) return Response.json({ error: 'invalid reschedule' }, { status: 409 });
    const newId = crypto.randomUUID();
    await database.batch([
      database.prepare('UPDATE study_plans SET completed = 2 WHERE id = ? AND completed = 0').bind(plan.id),
      database.prepare(`INSERT INTO study_plans
        (id, plan_date, category, title, detail, minutes, completed, source_plan_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`)
        .bind(newId, body.planDate, plan.category, plan.title, plan.detail, plan.minutes, plan.id, now),
    ]);
    return Response.json({ ok: true, newPlanId: newId, planDate: body.planDate });
  }

  const completed = Boolean(body.completed);
  const logId = `log:plan:${plan.id}`;
  if (completed) {
    await database.batch([
      database.prepare('UPDATE study_plans SET completed = 1 WHERE id = ?').bind(plan.id),
      database.prepare(`INSERT INTO study_logs
        (id, study_date, part, title, minutes, score, note, source_type, source_id, source_label, confused_items, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'plan', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET study_date = excluded.study_date, minutes = excluded.minutes,
          score = excluded.score, note = excluded.note, confused_items = excluded.confused_items, created_at = excluded.created_at`)
        .bind(logId, plan.plan_date, plan.category, plan.title, minutes(body.minutes ?? plan.minutes), text(body.score, 30), text(body.note, 300), plan.id, plan.title, text(body.confusedItems, 300), now),
    ]);
  } else {
    await database.batch([
      database.prepare('UPDATE study_plans SET completed = 0 WHERE id = ? AND completed = 1').bind(plan.id),
      database.prepare("DELETE FROM study_logs WHERE id = ? AND source_type = 'plan'").bind(logId),
    ]);
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!(await canMutate(request))) return unauthorized();
  await ensureSchema();
  const url = new URL(request.url);
  const id = text(url.searchParams.get('id'), 80);
  const kind = url.searchParams.get('kind');
  if (!id || (kind !== 'log' && kind !== 'plan')) return Response.json({ error: 'invalid input' }, { status: 400 });
  if (kind === 'log') {
    await db().prepare('DELETE FROM study_logs WHERE id = ?').bind(id).run();
  } else {
    const database = db();
    await database.batch([
      database.prepare('DELETE FROM study_plans WHERE id = ?').bind(id),
      database.prepare("DELETE FROM study_logs WHERE source_type = 'plan' AND source_id = ?").bind(id),
    ]);
  }
  return Response.json({ ok: true });
}
