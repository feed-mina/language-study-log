import type { AssetRow, ContentKind, ContentRow, StudyPayload, WorkerEnv } from './types';
import { createEmptyCard } from 'ts-fsrs';

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
      source_plan_id TEXT,
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
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_cards (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      language TEXT NOT NULL,
      category TEXT NOT NULL,
      prompt TEXT NOT NULL,
      answer TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      options_json TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'generated',
      due TEXT NOT NULL,
      stability REAL NOT NULL DEFAULT 0,
      difficulty REAL NOT NULL DEFAULT 0,
      elapsed_days INTEGER NOT NULL DEFAULT 0,
      scheduled_days INTEGER NOT NULL DEFAULT 0,
      learning_steps INTEGER NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      state INTEGER NOT NULL DEFAULT 0,
      last_review TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uq_study_cards_content_prompt ON study_cards(content_id, prompt)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_study_cards_due ON study_cards(due)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_study_cards_language_due ON study_cards(language, due)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS review_logs (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      reviewed_at TEXT NOT NULL,
      previous_due TEXT NOT NULL,
      next_due TEXT NOT NULL,
      scheduled_days INTEGER NOT NULL,
      stability REAL NOT NULL,
      difficulty REAL NOT NULL,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_review_logs_card_reviewed ON review_logs(card_id, reviewed_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS telegram_connections (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      update_id INTEGER NOT NULL,
      connected_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS study_goals (
      id TEXT PRIMARY KEY,
      target_score INTEGER NOT NULL,
      exam_date TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS toeic_scores (
      id TEXT PRIMARY KEY,
      score INTEGER NOT NULL,
      score_date TEXT NOT NULL,
      score_type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_toeic_scores_date ON toeic_scores(score_date, created_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY, material_id TEXT NOT NULL, item_index INTEGER NOT NULL,
      selected_label TEXT NOT NULL, correct_label TEXT NOT NULL, prompt TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_quiz_attempts_material ON quiz_attempts(material_id, item_index)'),
  ]);
}

export async function findTelegramChatId(env: WorkerEnv): Promise<string | null> {
  const row = await env.DB.prepare("SELECT chat_id FROM telegram_connections WHERE id = 'primary' LIMIT 1")
    .first<{ chat_id: string }>();
  return row?.chat_id?.trim() || null;
}

export async function saveTelegramConnection(env: WorkerEnv, chatId: string, updateId: number): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO telegram_connections (id, chat_id, update_id, connected_at, updated_at)
    VALUES ('primary', ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING`)
    .bind(chatId, updateId, now, now)
    .run();
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

  const newCard = createEmptyCard(new Date(now));
  const cardStatements = payload.items.map((item, index) => env.DB.prepare(`INSERT OR IGNORE INTO study_cards
    (id, content_id, language, category, prompt, answer, explanation, options_json, source, due, stability, difficulty,
     elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      `card:${stored.id}:${index + 1}`,
      stored.id,
      kind,
      kind,
      item.prompt,
      item.answer,
      item.explanation,
      JSON.stringify(item.options ?? []),
      newCard.due.toISOString(),
      newCard.stability,
      newCard.difficulty,
      newCard.elapsed_days,
      newCard.scheduled_days,
      newCard.learning_steps,
      newCard.reps,
      newCard.lapses,
      newCard.state,
      newCard.last_review?.toISOString() ?? null,
      now,
      now,
    ));
  if (cardStatements.length > 0) await env.DB.batch(cardStatements);
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
