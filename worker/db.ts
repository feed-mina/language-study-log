import type { AssetRow, ContentKind, ContentRow, StudyPayload, WorkerEnv } from './types';

export async function ensureAutomationSchema(env: WorkerEnv): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_plans (
      id TEXT PRIMARY KEY,
      plan_date TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      minutes INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_study_plans_date ON study_plans(plan_date)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_content (
      id TEXT PRIMARY KEY,
      content_date TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      body_json TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uq_study_content_date_kind ON study_content(content_date, kind)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_study_content_date ON study_content(content_date)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_assets (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      kind TEXT NOT NULL,
      r2_key TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uq_study_assets_r2_key ON study_assets(r2_key)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_study_assets_content ON study_assets(content_id)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS delivery_logs (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_id TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_content_channel_recipient ON delivery_logs(content_id, channel, recipient_hash)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_delivery_content ON delivery_logs(content_id)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      job_kind TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      finished_at TEXT
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_automation_runs_scheduled ON automation_runs(scheduled_for)'),
  ]);
}

export async function findContent(env: WorkerEnv, date: string, kind: ContentKind): Promise<ContentRow | null> {
  return env.DB.prepare('SELECT * FROM study_content WHERE content_date = ? AND kind = ? LIMIT 1')
    .bind(date, kind)
    .first<ContentRow>();
}

export async function findContentById(env: WorkerEnv, id: string): Promise<ContentRow | null> {
  return env.DB.prepare('SELECT * FROM study_content WHERE id = ? LIMIT 1').bind(id).first<ContentRow>();
}

export async function listContent(env: WorkerEnv, date: string, kind?: ContentKind): Promise<ContentRow[]> {
  const statement = kind
    ? env.DB.prepare('SELECT * FROM study_content WHERE content_date = ? AND kind = ? ORDER BY kind').bind(date, kind)
    : env.DB.prepare('SELECT * FROM study_content WHERE content_date = ? ORDER BY kind').bind(date);
  const result = await statement.all<ContentRow>();
  return result.results ?? [];
}

export async function insertContent(
  env: WorkerEnv,
  date: string,
  kind: ContentKind,
  payload: StudyPayload,
  model: string,
): Promise<ContentRow> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT OR IGNORE INTO study_content
    (id, content_date, kind, title, summary, body_json, model, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`)
    .bind(id, date, kind, payload.title, payload.summary, JSON.stringify(payload), model, now, now)
    .run();

  const stored = await findContent(env, date, kind);
  if (!stored) throw new Error('Study content could not be stored');

  const category = kind === 'english' ? 'ENGLISH' : kind === 'japanese' ? 'JAPANESE' : 'TOEIC';
  const minutes = kind === 'toeic' ? 45 : 20;
  await env.DB.prepare(`INSERT OR IGNORE INTO study_plans
    (id, plan_date, category, title, detail, minutes, completed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
    .bind(`content:${stored.id}`, date, category, payload.title, payload.summary.slice(0, 120), minutes, now)
    .run();
  return stored;
}

export async function listAssets(env: WorkerEnv, contentId: string): Promise<AssetRow[]> {
  const result = await env.DB.prepare('SELECT * FROM study_assets WHERE content_id = ? ORDER BY created_at')
    .bind(contentId)
    .all<AssetRow>();
  return result.results ?? [];
}

export async function findAsset(env: WorkerEnv, id: string): Promise<AssetRow | null> {
  return env.DB.prepare('SELECT * FROM study_assets WHERE id = ? LIMIT 1').bind(id).first<AssetRow>();
}

export async function insertAsset(
  env: WorkerEnv,
  input: Omit<AssetRow, 'created_at'>,
): Promise<AssetRow> {
  const createdAt = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO study_assets
    (id, content_id, kind, r2_key, filename, content_type, bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(input.id, input.content_id, input.kind, input.r2_key, input.filename, input.content_type, input.bytes, createdAt)
    .run();
  return { ...input, created_at: createdAt };
}

export async function startAutomationRun(env: WorkerEnv, kind: ContentKind, scheduledFor: string): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO automation_runs
    (id, job_kind, scheduled_for, status, detail, started_at)
    VALUES (?, ?, ?, 'running', '', ?)`)
    .bind(id, kind, scheduledFor, new Date().toISOString())
    .run();
  return id;
}

export async function finishAutomationRun(env: WorkerEnv, id: string, status: 'completed' | 'failed', detail: string): Promise<void> {
  await env.DB.prepare('UPDATE automation_runs SET status = ?, detail = ?, finished_at = ? WHERE id = ?')
    .bind(status, detail.slice(0, 1000), new Date().toISOString(), id)
    .run();
}
