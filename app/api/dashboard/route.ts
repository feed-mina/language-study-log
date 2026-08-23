import { env } from 'cloudflare:workers';

export const runtime = 'edge';

type Row = Record<string, string | number | null>;

function db() {
  return (env as Cloudflare.Env & { DB: D1Database }).DB;
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
function relativeDate(value: string, amount: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }

async function seedIfEmpty(date: string) {
  const database = db();
  const planCount = await database.prepare('SELECT COUNT(*) AS total FROM study_plans').first<{ total: number }>();
  const logCount = await database.prepare('SELECT COUNT(*) AS total FROM study_logs').first<{ total: number }>();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (!planCount?.total) {
    statements.push(
      database.prepare('INSERT INTO study_plans (id, plan_date, category, title, detail, minutes, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), date, 'LC', 'Part 2 · 질의응답', '실전 문제 25개 + 오답 다시 듣기', 40, 0, now),
      database.prepare('INSERT INTO study_plans (id, plan_date, category, title, detail, minutes, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), date, 'RC', 'Part 5 · 문법', '관계사 핵심 정리 + 문제 20개', 35, 0, now),
    );
  }
  if (!logCount?.total) {
    const samples = [
      [relativeDate(date, -1), 'RC', '문법 오답 30문제', 45, '26 / 30', '관계대명사와 관계부사 구분 복습'],
      [relativeDate(date, -2), 'LC', '대화문 집중 듣기', 60, '82%', '의도 파악 문제를 한 번 더 듣기'],
      [relativeDate(date, -3), 'VOCA', '빈출 어휘 Day 12', 35, '48개', '헷갈린 단어 7개 표시'],
    ];
    for (const sample of samples) statements.push(database.prepare('INSERT INTO study_logs (id, study_date, part, title, minutes, score, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), ...sample, now));
  }
  if (statements.length) await database.batch(statements);
}

export async function GET(request: Request) {
  await ensureSchema();
  const url = new URL(request.url);
  const date = validDate(url.searchParams.get('date')) ? url.searchParams.get('date')! : new Date().toISOString().slice(0, 10);
  const start = validDate(url.searchParams.get('start')) ? url.searchParams.get('start')! : date;
  const end = validDate(url.searchParams.get('end')) ? url.searchParams.get('end')! : date;
  await seedIfEmpty(date);
  const database = db();
  const [plansResult, logsResult, datesResult] = await Promise.all([
    database.prepare('SELECT * FROM study_plans WHERE plan_date = ? ORDER BY created_at ASC').bind(date).all<Row>(),
    database.prepare('SELECT * FROM study_logs ORDER BY study_date DESC, created_at DESC LIMIT 30').all<Row>(),
    database.prepare(`SELECT study_date AS date FROM study_logs WHERE study_date BETWEEN ? AND ?
      UNION SELECT plan_date AS date FROM study_plans WHERE completed = 1 AND plan_date BETWEEN ? AND ?`).bind(start, end, start, end).all<{ date: string }>(),
  ]);
  return Response.json({
    plans: (plansResult.results ?? []).map((row) => ({ id: row.id, planDate: row.plan_date, category: row.category, title: row.title, detail: row.detail, minutes: row.minutes, completed: row.completed })),
    logs: (logsResult.results ?? []).map((row) => ({ id: row.id, studyDate: row.study_date, part: row.part, title: row.title, minutes: row.minutes, score: row.score, note: row.note, createdAt: row.created_at })),
    completedDates: (datesResult.results ?? []).map((row) => row.date),
  });
}

export async function POST(request: Request) {
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
  await ensureSchema();
  const body = await request.json() as Record<string, unknown>;
  const id = text(body.id, 80);
  if (!id) return Response.json({ error: 'invalid id' }, { status: 400 });
  await db().prepare('UPDATE study_plans SET completed = ? WHERE id = ?').bind(body.completed ? 1 : 0, id).run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  await ensureSchema();
  const url = new URL(request.url);
  const id = text(url.searchParams.get('id'), 80);
  const kind = url.searchParams.get('kind');
  if (!id || (kind !== 'log' && kind !== 'plan')) return Response.json({ error: 'invalid input' }, { status: 400 });
  await db().prepare(kind === 'log' ? 'DELETE FROM study_logs WHERE id = ?' : 'DELETE FROM study_plans WHERE id = ?').bind(id).run();
  return Response.json({ ok: true });
}
