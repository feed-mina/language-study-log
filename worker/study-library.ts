import { isDate, StudyCycleError } from './study-cycle.ts';
import { ensureRestartSchema } from './restart-cycle.ts';

const LIBRARY_KINDS = ['english', 'japanese', 'toeic'] as const;
const LIBRARY_STATUSES = ['ready', 'in_progress', 'completed'] as const;

type LibraryKind = (typeof LIBRARY_KINDS)[number];
type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

type ContentRow = {
  id: string; content_date: string; kind: LibraryKind; title: string; summary: string;
  status: LibraryStatus; created_at: string; asset_count: number;
};

type BatchRow = {
  id: string; backlog_count: number; replaced_today_count: number; total_minutes: number;
  reason: string; created_at: string; restored_at: string | null; archived_count: number;
};

type RestoreRow = { id: string; plan_date: string; minutes: number };

export type StudyLibraryQuery = {
  kind?: string | null; status?: string | null; search?: string | null;
  from?: string | null; to?: string | null; limit?: number;
};

export type ArchiveBatchRestoreInput = { batchId: string; requestId: string; confirmed: boolean };

export type ArchiveBatchRestoreResult = {
  ok: true; replayed: boolean; batchId: string; restoredCount: number; restoredAt: string;
};

function boundedSearch(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

function libraryKind(value: string | null | undefined): LibraryKind | null {
  if (!value || value === 'all') return null;
  if (!LIBRARY_KINDS.includes(value as LibraryKind)) throw new StudyCycleError(400, 'INVALID_LIBRARY_KIND', 'kind must be all, english, japanese, or toeic');
  return value as LibraryKind;
}

function libraryStatus(value: string | null | undefined): LibraryStatus | null {
  if (!value || value === 'all') return null;
  if (!LIBRARY_STATUSES.includes(value as LibraryStatus)) throw new StudyCycleError(400, 'INVALID_LIBRARY_STATUS', 'status must be all, ready, in_progress, or completed');
  return value as LibraryStatus;
}

function optionalDate(value: string | null | undefined, name: string): string | null {
  if (!value) return null;
  if (!isDate(value)) throw new StudyCycleError(400, 'INVALID_LIBRARY_DATE', `${name} must use YYYY-MM-DD`);
  return value;
}

function materialView(row: ContentRow) {
  return {
    id: row.id,
    date: row.content_date,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    status: row.status,
    createdAt: row.created_at,
    assetCount: Number(row.asset_count ?? 0),
    openPath: `/?date=${encodeURIComponent(row.content_date)}&material=${encodeURIComponent(row.id)}`,
  };
}

export async function listStudyLibrary(database: D1Database, input: StudyLibraryQuery = {}) {
  const kind = libraryKind(input.kind);
  const status = libraryStatus(input.status);
  const search = boundedSearch(input.search);
  const from = optionalDate(input.from, 'from');
  const to = optionalDate(input.to, 'to');
  if (from && to && from > to) throw new StudyCycleError(400, 'INVALID_LIBRARY_RANGE', 'from must be on or before to');
  const limit = Math.max(1, Math.min(60, Math.trunc(input.limit ?? 24)));
  const where: string[] = [];
  const args: Array<string | number> = [];
  if (kind) { where.push('content.kind = ?'); args.push(kind); }
  if (status) { where.push('content.status = ?'); args.push(status); }
  if (from) { where.push('content.content_date >= ?'); args.push(from); }
  if (to) { where.push('content.content_date <= ?'); args.push(to); }
  if (search) {
    where.push("(instr(lower(content.title),lower(?))>0 OR instr(lower(content.summary),lower(?))>0 OR instr(lower(content.body_json),lower(?))>0)");
    args.push(search, search, search);
  }
  const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, total, kinds, statuses] = await Promise.all([
    database.prepare(`SELECT content.id,content.content_date,content.kind,content.title,content.summary,content.status,content.created_at,
      COUNT(assets.id) AS asset_count FROM study_content content LEFT JOIN study_assets assets ON assets.content_id=content.id
      ${condition} GROUP BY content.id ORDER BY content.content_date DESC,content.kind,content.id LIMIT ?`).bind(...args, limit).all<ContentRow>(),
    database.prepare(`SELECT COUNT(*) AS count FROM study_content content ${condition}`).bind(...args).first<{ count: number }>(),
    database.prepare('SELECT kind,COUNT(*) AS count FROM study_content GROUP BY kind ORDER BY kind').all<{ kind: string; count: number }>(),
    database.prepare('SELECT status,COUNT(*) AS count FROM study_content GROUP BY status ORDER BY status').all<{ status: string; count: number }>(),
  ]);
  return {
    filters: { kind: kind ?? 'all', status: status ?? 'all', search, from, to },
    items: (rows.results ?? []).map(materialView),
    total: Number(total?.count ?? 0),
    counts: {
      byKind: Object.fromEntries((kinds.results ?? []).map((row) => [row.kind, Number(row.count)])),
      byStatus: Object.fromEntries((statuses.results ?? []).map((row) => [row.status, Number(row.count)])),
    },
  };
}

export async function listArchiveBatches(database: D1Database, limit = 10) {
  await ensureRestartSchema(database);
  const safeLimit = Math.max(1, Math.min(30, Math.trunc(limit)));
  const rows = await database.prepare(`SELECT batches.id,batches.backlog_count,batches.replaced_today_count,batches.total_minutes,
    batches.reason,batches.created_at,batches.restored_at,
    SUM(CASE WHEN plans.status='archived' AND plans.archive_batch_id=batches.id THEN 1 ELSE 0 END) AS archived_count
    FROM study_archive_batches batches
    LEFT JOIN study_archive_batch_items items ON items.batch_id=batches.id
    LEFT JOIN study_plans plans ON plans.id=items.plan_id
    GROUP BY batches.id ORDER BY batches.created_at DESC LIMIT ?`).bind(safeLimit).all<BatchRow>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    backlogCount: Number(row.backlog_count),
    replacedTodayCount: Number(row.replaced_today_count),
    totalMinutes: Number(row.total_minutes),
    reason: row.reason,
    createdAt: row.created_at,
    restoredAt: row.restored_at,
    archivedCount: Number(row.archived_count ?? 0),
    canRestore: !row.restored_at && Number(row.archived_count ?? 0) > 0,
  }));
}

function validateRestoreInput(input: ArchiveBatchRestoreInput): void {
  if (!/^[0-9a-f-]{20,64}$/i.test(input.batchId)) throw new StudyCycleError(400, 'INVALID_BATCH_ID', 'batch_id is invalid');
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(input.requestId)) throw new StudyCycleError(400, 'INVALID_REQUEST_ID', 'request_id must be 8-128 safe characters');
  if (!input.confirmed) throw new StudyCycleError(400, 'CONFIRMATION_REQUIRED', 'confirmed must be true');
}

export async function restoreArchiveBatch(
  database: D1Database,
  input: ArchiveBatchRestoreInput,
  now = new Date().toISOString(),
): Promise<ArchiveBatchRestoreResult> {
  validateRestoreInput(input);
  await ensureRestartSchema(database);
  const replay = await database.prepare('SELECT id,restore_request_id,restore_result_json FROM study_archive_batches WHERE restore_request_id=? LIMIT 1')
    .bind(input.requestId).first<{ id: string; restore_request_id: string; restore_result_json: string }>();
  if (replay) {
    if (replay.id !== input.batchId) throw new StudyCycleError(409, 'IDEMPOTENCY_KEY_REUSED', 'request_id was already used for another batch');
    try { return { ...(JSON.parse(replay.restore_result_json) as ArchiveBatchRestoreResult), replayed: true }; }
    catch { throw new StudyCycleError(500, 'INVALID_RESTORE_RESULT', 'stored restore result is invalid'); }
  }
  const batch = await database.prepare('SELECT id,restored_at FROM study_archive_batches WHERE id=? LIMIT 1')
    .bind(input.batchId).first<{ id: string; restored_at: string | null }>();
  if (!batch) throw new StudyCycleError(404, 'ARCHIVE_BATCH_NOT_FOUND', 'archive batch not found');
  if (batch.restored_at) throw new StudyCycleError(409, 'ARCHIVE_BATCH_ALREADY_RESTORED', 'archive batch was already restored');
  const rows = await database.prepare(`SELECT plans.id,plans.plan_date,plans.minutes FROM study_plans plans
    JOIN study_archive_batch_items items ON items.plan_id=plans.id
    WHERE items.batch_id=? AND plans.status='archived' AND plans.archive_batch_id=?
    ORDER BY plans.plan_date,plans.id`).bind(input.batchId, input.batchId).all<RestoreRow>();
  if (!rows.results.length) throw new StudyCycleError(409, 'ARCHIVE_BATCH_EMPTY', 'archive batch has no restorable plans');
  const byDate = new Map<string, number>();
  for (const row of rows.results) byDate.set(row.plan_date, (byDate.get(row.plan_date) ?? 0) + Number(row.minutes));
  for (const [date, restoreMinutes] of byDate) {
    const active = await database.prepare("SELECT COALESCE(SUM(minutes),0) AS minutes FROM study_plans WHERE plan_date=? AND status='planned'")
      .bind(date).first<{ minutes: number }>();
    if (Number(active?.minutes ?? 0) + restoreMinutes > 40) {
      throw new StudyCycleError(409, 'RESTORE_DAILY_LIMIT_EXCEEDED', `${date} 계획을 복원하면 하루 40분을 초과합니다`);
    }
  }
  const result: ArchiveBatchRestoreResult = { ok: true, replayed: false, batchId: input.batchId, restoredCount: rows.results.length, restoredAt: now };
  const statements: D1PreparedStatement[] = rows.results.map((row) => database.prepare(`UPDATE study_plans SET
    status='planned',completed=0,archived_at=NULL,archive_reason='',archive_batch_id=NULL,updated_at=?
    WHERE id=? AND status='archived' AND archive_batch_id=?`).bind(now, row.id, input.batchId));
  statements.push(database.prepare(`UPDATE study_archive_batches SET restored_at=?,restore_request_id=?,restore_result_json=?
    WHERE id=? AND restored_at IS NULL`).bind(now, input.requestId, JSON.stringify(result), input.batchId));
  await database.batch(statements);
  return result;
}

export async function readStudyState(database: D1Database, now = new Date()) {
  await ensureRestartSchema(database);
  const [cycles, tracks, batches, due] = await Promise.all([
    database.prepare("SELECT language,curriculum_version AS curriculumVersion,start_step AS startStep,state,daily_minutes AS dailyMinutes,started_on AS startedOn FROM study_cycles WHERE state='active' ORDER BY language").all(),
    database.prepare('SELECT language,state,daily_minutes AS dailyMinutes,curriculum_version AS curriculumVersion FROM study_track_settings ORDER BY language').all(),
    listArchiveBatches(database, 5),
    database.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN lapses>0 OR difficulty>=5 THEN 1 ELSE 0 END) AS weak,
      SUM(CASE WHEN state<=1 THEN 1 ELSE 0 END) AS low_stage
      FROM study_cards WHERE due<=?`).bind(now.toISOString()).first<{ total: number; weak: number; low_stage: number }>(),
  ]);
  return {
    cycles: cycles.results ?? [],
    tracks: tracks.results ?? [],
    archiveBatches: batches,
    reviewPriority: { totalDue: Number(due?.total ?? 0), weakCount: Number(due?.weak ?? 0), lowStageCount: Number(due?.low_stage ?? 0) },
  };
}
