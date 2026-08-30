import { env } from 'cloudflare:workers';

import { isAuthorizedDashboardMutation } from './auth';

export const runtime = 'edge';

type Row = Record<string, string | number | null>;

function db() {
  return (env as Cloudflare.Env & { DB: D1Database }).DB;
}

function canMutate(request: Request) {
  const adminToken = (env as Cloudflare.Env & { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  return isAuthorizedDashboardMutation(request, adminToken);
}

function unauthorized() {
  return Response.json({ error: 'administrator login required' }, { status: 401, headers: { 'cache-control': 'no-store' } });
}

async function ensureSchema() {
  const database = db();
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS study_plans (
      id TEXT PRIMARY KEY,
      plan_date TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      minutes INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS study_logs (
      id TEXT PRIMARY KEY,
      study_date TEXT NOT NULL,
      part TEXT NOT NULL,
      title TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      score TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_plans_date ON study_plans(plan_date)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_logs_date ON study_logs(study_date)'),
  ]);
}

function validDate(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value); }
function text(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function minutes(value: unknown) { const number = Number(value); return Number.isFinite(number) ? Math.min(600, Math.max(1, Math.round(number))) : 1; }

export async function GET(request: Request) {
  await ensureSchema();
  const url = new URL(request.url);
  const date = validDate(url.searchParams.get('date')) ? url.searchParams.get('date')! : new Date().toISOString().slice(0, 10);
  const start = validDate(url.searchParams.get('start')) ? url.searchParams.get('start')! : date;
  const end = validDate(url.searchParams.get('end')) ? url.searchParams.get('end')! : date;
  const database = db();
  const [plansResult, overdueResult, logsResult, datesResult] = await Promise.all([
    database.prepare('SELECT * FROM study_plans WHERE plan_date = ? ORDER BY created_at ASC').bind(date).all<Row>(),
    database.prepare(`SELECT * FROM study_plans
      WHERE plan_date < ? AND completed = 0
      ORDER BY plan_date DESC, created_at ASC LIMIT 7`).bind(date).all<Row>(),
    database.prepare('SELECT * FROM study_logs ORDER BY study_date DESC, created_at DESC LIMIT 30').all<Row>(),
    database.prepare(`SELECT study_date AS date FROM study_logs WHERE study_date BETWEEN ? AND ?
      UNION SELECT plan_date AS date FROM study_plans WHERE completed = 1 AND plan_date BETWEEN ? AND ?`).bind(start, end, start, end).all<{ date: string }>(),
  ]);
  return Response.json({
    plans: (plansResult.results ?? []).map((row) => ({ id: row.id, planDate: row.plan_date, category: row.category, title: row.title, detail: row.detail, minutes: row.minutes, completed: row.completed })),
    overduePlans: (overdueResult.results ?? []).map((row) => ({ id: row.id, planDate: row.plan_date, category: row.category, title: row.title, detail: row.detail, minutes: row.minutes, completed: row.completed })),
    logs: (logsResult.results ?? []).map((row) => ({ id: row.id, studyDate: row.study_date, part: row.part, title: row.title, minutes: row.minutes, score: row.score, note: row.note, createdAt: row.created_at })),
    completedDates: (datesResult.results ?? []).map((row) => row.date),
  });
}

export async function POST(request: Request) {
  if (!(await canMutate(request))) return unauthorized();
  await ensureSchema();
  const body = await request.json() as Record<string, unknown>;
  const database = db();
  const now = new Date().toISOString();
  if (body.kind === 'log') {
    if (!validDate(body.studyDate) || !text(body.title, 80)) return Response.json({ error: 'invalid input' }, { status: 400 });
    await database.prepare('INSERT INTO study_logs (id, study_date, part, title, minutes, score, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), body.studyDate, text(body.part, 12), text(body.title, 80), minutes(body.minutes), text(body.score, 30), text(body.note, 300), now).run();
  } else if (body.kind === 'plan') {
    if (!validDate(body.planDate) || !text(body.title, 80)) return Response.json({ error: 'invalid input' }, { status: 400 });
    await database.prepare('INSERT INTO study_plans (id, plan_date, category, title, detail, minutes, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)').bind(crypto.randomUUID(), body.planDate, text(body.category, 12), text(body.title, 80), text(body.detail, 120), minutes(body.minutes), now).run();
  } else return Response.json({ error: 'invalid kind' }, { status: 400 });
  return Response.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!(await canMutate(request))) return unauthorized();
  await ensureSchema();
  const body = await request.json() as Record<string, unknown>;
  const id = text(body.id, 80);
  if (!id) return Response.json({ error: 'invalid id' }, { status: 400 });
  if (body.action === 'reschedule') {
    if (!validDate(body.planDate)) return Response.json({ error: 'invalid date' }, { status: 400 });
    await db().prepare('UPDATE study_plans SET plan_date = ? WHERE id = ? AND completed = 0').bind(body.planDate, id).run();
  } else {
    await db().prepare('UPDATE study_plans SET completed = ? WHERE id = ?').bind(body.completed ? 1 : 0, id).run();
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
  await db().prepare(kind === 'log' ? 'DELETE FROM study_logs WHERE id = ?' : 'DELETE FROM study_plans WHERE id = ?').bind(id).run();
  return Response.json({ ok: true });
}
