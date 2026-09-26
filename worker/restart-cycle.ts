import { assertPlanFitsDailyLimit, isDate, StudyCycleError, validateActiveDailyMinutes } from './study-cycle.ts';

const DAILY_LIMIT_MINUTES = 40;
const RESTART_CATEGORIES = ['ENGLISH', 'JAPANESE', 'TOEIC'] as const;

type RestartRow = { id: string; plan_date: string; category: string; minutes: number };
type ExistingBatch = { id: string; result_json?: string };

export type RestartPreview = {
  restartDate: string;
  backlogCount: number;
  backlogMinutes: number;
  todayReplaceCount: number;
  todayReplaceMinutes: number;
  archiveCount: number;
  snapshotToken: string;
  dailyLimitMinutes: 40;
  newCycles: Array<{ language: 'ENGLISH' | 'JAPANESE'; minutes: 20; curriculumVersion: 'beginner-v1'; startStep: 1 }>;
  pausedTracks: ['TOEIC'];
  preservesMaterials: true;
};

export type RestartInput = {
  requestId: string;
  restartDate: string;
  expectedBacklogCount: number;
  snapshotToken: string;
  confirmed: boolean;
};

export type RestartResult = RestartPreview & { ok: true; replayed: boolean; batchId: string; cycleIds: string[] };

export async function ensureRestartSchema(database: D1Database): Promise<void> {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS study_cycles (
      id TEXT PRIMARY KEY, language TEXT NOT NULL, curriculum_version TEXT NOT NULL,
      start_step INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL DEFAULT 'active',
      daily_minutes INTEGER NOT NULL, started_on TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_cycles_language_state ON study_cycles(language, state)'),
    database.prepare(`CREATE TABLE IF NOT EXISTS study_track_settings (
      language TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'active', daily_minutes INTEGER NOT NULL,
      curriculum_version TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS study_archive_batches (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL, snapshot_token TEXT NOT NULL,
      backlog_count INTEGER NOT NULL, replaced_today_count INTEGER NOT NULL,
      total_minutes INTEGER NOT NULL, reason TEXT NOT NULL, result_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
    )`),
    database.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uq_study_archive_batches_request ON study_archive_batches(request_id)'),
    database.prepare(`CREATE TABLE IF NOT EXISTS study_archive_batch_items (
      batch_id TEXT NOT NULL, plan_id TEXT NOT NULL, item_scope TEXT NOT NULL,
      PRIMARY KEY(batch_id, plan_id),
      FOREIGN KEY(batch_id) REFERENCES study_archive_batches(id) ON DELETE RESTRICT,
      FOREIGN KEY(plan_id) REFERENCES study_plans(id) ON DELETE RESTRICT
    )`),
  ]);
  const columns = await database.prepare('PRAGMA table_info(study_plans)').all<{ name: string }>();
  const names = new Set((columns.results ?? []).map((column) => column.name));
  if (!names.has('cycle_id')) await database.prepare('ALTER TABLE study_plans ADD COLUMN cycle_id TEXT').run();
  if (!names.has('archive_batch_id')) await database.prepare('ALTER TABLE study_plans ADD COLUMN archive_batch_id TEXT').run();
  await database.batch([
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_plans_cycle ON study_plans(cycle_id)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_plans_archive_batch ON study_plans(archive_batch_id)'),
  ]);
}

function validateRequestId(value: string): void {
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(value)) throw new StudyCycleError(400, 'INVALID_REQUEST_ID', 'request_id must be 8-128 safe characters');
}

async function snapshotToken(rows: RestartRow[]): Promise<string> {
  const source = rows.map((row) => `${row.id}|${row.plan_date}|${row.category}|${row.minutes}`).join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function restartRows(database: D1Database, restartDate: string): Promise<RestartRow[]> {
  const result = await database.prepare(`SELECT id, plan_date, category, minutes FROM study_plans
    WHERE status = 'planned' AND plan_date <= ? AND category IN ('ENGLISH','JAPANESE','TOEIC')
    ORDER BY plan_date, created_at, id`).bind(restartDate).all<RestartRow>();
  return result.results ?? [];
}

export async function previewStudyRestart(database: D1Database, restartDate: string): Promise<RestartPreview> {
  if (!isDate(restartDate)) throw new StudyCycleError(400, 'INVALID_DATE', 'restart_date must use YYYY-MM-DD');
  await ensureRestartSchema(database);
  const rows = await restartRows(database, restartDate);
  const backlog = rows.filter((row) => row.plan_date < restartDate);
  const today = rows.filter((row) => row.plan_date === restartDate);
  return {
    restartDate,
    backlogCount: backlog.length,
    backlogMinutes: backlog.reduce((sum, row) => sum + row.minutes, 0),
    todayReplaceCount: today.length,
    todayReplaceMinutes: today.reduce((sum, row) => sum + row.minutes, 0),
    archiveCount: rows.length,
    snapshotToken: await snapshotToken(rows),
    dailyLimitMinutes: DAILY_LIMIT_MINUTES,
    newCycles: [
      { language: 'ENGLISH', minutes: 20, curriculumVersion: 'beginner-v1', startStep: 1 },
      { language: 'JAPANESE', minutes: 20, curriculumVersion: 'beginner-v1', startStep: 1 },
    ],
    pausedTracks: ['TOEIC'],
    preservesMaterials: true,
  };
}

export function validateDailyMinutes(minutes: number[]): void {
  if (minutes.some((value) => value < 1)) throw new StudyCycleError(409, 'DAILY_LIMIT_EXCEEDED', `active study plans may not exceed ${DAILY_LIMIT_MINUTES} minutes per day`);
  validateActiveDailyMinutes(minutes);
}

export async function executeStudyRestart(database: D1Database, input: RestartInput, now = new Date().toISOString()): Promise<RestartResult> {
  validateRequestId(input.requestId);
  if (!input.confirmed) throw new StudyCycleError(400, 'CONFIRMATION_REQUIRED', 'confirmed must be true');
  validateDailyMinutes([20, 20]);
  await ensureRestartSchema(database);
  const existing = await database.prepare('SELECT id, result_json FROM study_archive_batches WHERE request_id = ? LIMIT 1')
    .bind(input.requestId).first<ExistingBatch & { result_json: string }>();
  if (existing) {
    const parsed = JSON.parse(existing.result_json) as RestartResult;
    return { ...parsed, replayed: true };
  }
  const preview = await previewStudyRestart(database, input.restartDate);
  if (preview.backlogCount !== input.expectedBacklogCount || preview.snapshotToken !== input.snapshotToken) {
    throw new StudyCycleError(409, 'RESTART_PREVIEW_CHANGED', 'study plans changed; review a fresh preview before confirming');
  }
  const rows = await restartRows(database, input.restartDate);
  const batchId = crypto.randomUUID();
  const cycleIds = [crypto.randomUUID(), crypto.randomUUID()];
  const planIds = [crypto.randomUUID(), crypto.randomUUID()];
  const result: RestartResult = { ...preview, ok: true, replayed: false, batchId, cycleIds };
  const statements: D1PreparedStatement[] = [
    database.prepare(`INSERT INTO study_archive_batches
      (id, request_id, snapshot_token, backlog_count, replaced_today_count, total_minutes, reason, result_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(batchId, input.requestId, preview.snapshotToken, preview.backlogCount, preview.todayReplaceCount, preview.backlogMinutes + preview.todayReplaceMinutes, '새 입문 회차 시작', JSON.stringify(result), now),
    database.prepare("UPDATE study_cycles SET state = 'superseded', updated_at = ? WHERE language IN ('ENGLISH','JAPANESE') AND state = 'active'").bind(now),
    database.prepare(`INSERT INTO study_cycles (id, language, curriculum_version, start_step, state, daily_minutes, started_on, created_at, updated_at)
      VALUES (?, 'ENGLISH', 'beginner-v1', 1, 'active', 20, ?, ?, ?), (?, 'JAPANESE', 'beginner-v1', 1, 'active', 20, ?, ?, ?)`)
      .bind(cycleIds[0], input.restartDate, now, now, cycleIds[1], input.restartDate, now, now),
    database.prepare(`INSERT INTO study_track_settings (language, state, daily_minutes, curriculum_version, updated_at)
      VALUES ('ENGLISH','active',20,'beginner-v1',?),('JAPANESE','active',20,'beginner-v1',?),('TOEIC','paused',0,'paused',?)
      ON CONFLICT(language) DO UPDATE SET state=excluded.state, daily_minutes=excluded.daily_minutes,
        curriculum_version=excluded.curriculum_version, updated_at=excluded.updated_at`).bind(now, now, now),
    database.prepare(`INSERT INTO study_plans
      (id, plan_date, category, title, detail, minutes, completed, source_plan_id, status, root_plan_id, created_at, updated_at, archived_at, archive_reason, cycle_id, archive_batch_id)
      VALUES (?, ?, 'ENGLISH', '영어 처음부터 · 1단계', 'beginner-v1', 20, 0, NULL, 'planned', ?, ?, ?, NULL, '', ?, NULL),
             (?, ?, 'JAPANESE', '일본어 처음부터 · 1단계', 'beginner-v1', 20, 0, NULL, 'planned', ?, ?, ?, NULL, '', ?, NULL)`)
      .bind(planIds[0], input.restartDate, planIds[0], now, now, cycleIds[0], planIds[1], input.restartDate, planIds[1], now, now, cycleIds[1]),
  ];
  for (const row of rows) {
    const scope = row.plan_date < input.restartDate ? 'backlog' : 'replaced_today';
    statements.push(
      database.prepare('INSERT INTO study_archive_batch_items (batch_id, plan_id, item_scope) VALUES (?, ?, ?)').bind(batchId, row.id, scope),
      database.prepare("UPDATE study_plans SET status='archived', completed=0, archived_at=?, archive_reason='새 입문 회차 시작', archive_batch_id=?, updated_at=? WHERE id=? AND status='planned'").bind(now, batchId, now, row.id),
    );
  }
  await database.batch(statements);
  return result;
}

export async function trackAllowsPlan(database: D1Database, category: string, date: string, minutes: number): Promise<boolean> {
  await ensureRestartSchema(database);
  if (!RESTART_CATEGORIES.includes(category as (typeof RESTART_CATEGORIES)[number])) return true;
  const setting = await database.prepare('SELECT state, daily_minutes FROM study_track_settings WHERE language = ? LIMIT 1')
    .bind(category).first<{ state: string; daily_minutes: number }>();
  if (setting?.state === 'paused') return false;
  await assertPlanFitsDailyLimit(database, date, minutes);
  return true;
}
