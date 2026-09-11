export const PLAN_STATUSES = ['planned', 'completed', 'rescheduled', 'archived'] as const;
export const PLAN_COMMANDS = ['complete', 'undo-complete', 'reschedule', 'archive', 'restore'] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];
export type PlanCommand = (typeof PLAN_COMMANDS)[number];

type PlanRow = {
  id: string;
  plan_date: string;
  category: string;
  title: string;
  detail: string;
  minutes: number;
  completed: number;
  source_plan_id: string | null;
  status: string;
  root_plan_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archive_reason: string;
  material_id?: string | null;
  material_date?: string | null;
};

type LogRow = {
  id: string;
  study_date: string;
  part: string;
  title: string;
  minutes: number;
  score: string;
  note: string;
  source_type: string;
  source_id: string | null;
  source_label: string;
  confused_items: string;
  created_at: string;
  material_id?: string | null;
  material_date?: string | null;
};

type EventRow = {
  plan_id: string;
  event_type: string;
  target_date: string | null;
  result_json: string;
};

export type StudyPlanView = {
  id: string;
  planDate: string;
  category: string;
  title: string;
  detail: string;
  minutes: number;
  completed: number;
  status: PlanStatus;
  sourcePlanId: string | null;
  rootPlanId: string;
  updatedAt: string;
  archivedAt: string | null;
  archiveReason: string;
  materialId?: string;
  openPath?: string;
};

export type StudyLogView = {
  id: string;
  studyDate: string;
  part: string;
  title: string;
  minutes: number;
  score: string;
  note: string;
  sourceType: string;
  sourceId: string | null;
  sourceLabel: string;
  confusedItems: string;
  createdAt: string;
  materialId?: string;
  openPath?: string;
};

export type RecoverySummary = {
  totalCount: number;
  totalMinutes: number;
  oldestPlanDate: string | null;
  recent: StudyPlanView[];
  medium: StudyPlanView[];
  old: StudyPlanView[];
  recommended: StudyPlanView[];
  archived: StudyPlanView[];
};

export type PlanCommandInput = {
  requestId: string;
  command: PlanCommand;
  planId: string;
  targetDate?: string | null;
  archiveReason?: string;
  minutes?: number;
  score?: string;
  note?: string;
  confusedItems?: string;
  startMinute?: number | null;
  scheduleGuard?: boolean;
};

export type PlanCommandResult = {
  ok: true;
  replayed: boolean;
  command: PlanCommand;
  plan: StudyPlanView;
  createdPlan?: StudyPlanView;
};

export class StudyCycleError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function ensureStudyCycleSchema(database: D1Database): Promise<void> {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS study_plans (
      id TEXT PRIMARY KEY, plan_date TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '', minutes INTEGER NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      source_plan_id TEXT, status TEXT NOT NULL DEFAULT 'planned', root_plan_id TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT '', archived_at TEXT,
      archive_reason TEXT NOT NULL DEFAULT ''
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS study_logs (
      id TEXT PRIMARY KEY, study_date TEXT NOT NULL, part TEXT NOT NULL, title TEXT NOT NULL,
      minutes INTEGER NOT NULL, score TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'legacy', source_id TEXT, source_label TEXT NOT NULL DEFAULT '',
      confused_items TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS study_content (
      id TEXT PRIMARY KEY, content_date TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '', body_json TEXT NOT NULL, model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS study_plan_events (
      id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, event_type TEXT NOT NULL, from_status TEXT,
      to_status TEXT NOT NULL, related_plan_id TEXT, target_date TEXT, idempotency_key TEXT,
      result_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
    )`),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_plans_date ON study_plans(plan_date)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_plans_status_date ON study_plans(status, plan_date)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_logs_date ON study_logs(study_date)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_logs_source ON study_logs(source_type, source_id)'),
    database.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uq_study_content_date_kind ON study_content(content_date, kind)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_content_date ON study_content(content_date)'),
    database.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uq_study_plan_events_idempotency ON study_plan_events(idempotency_key)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_study_plan_events_plan_created ON study_plan_events(plan_id, created_at)'),
  ]);
}

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function isPlanCommand(value: unknown): value is PlanCommand {
  return typeof value === 'string' && PLAN_COMMANDS.includes(value as PlanCommand);
}

function statusFromRow(row: Pick<PlanRow, 'status' | 'completed'>): PlanStatus {
  if (PLAN_STATUSES.includes(row.status as PlanStatus)) return row.status as PlanStatus;
  if (row.completed === 1) return 'completed';
  if (row.completed === 2) return 'rescheduled';
  return 'planned';
}

export function materialOpenPath(materialId: string | null | undefined, materialDate: string | null | undefined): string | null {
  if (!materialId || materialId.length > 100 || !isDate(materialDate)) return null;
  return `/?date=${encodeURIComponent(materialDate)}&material=${encodeURIComponent(materialId)}`;
}

function materialLink(row: { material_id?: string | null; material_date?: string | null }): { materialId?: string; openPath?: string } {
  const openPath = materialOpenPath(row.material_id, row.material_date);
  return row.material_id && openPath ? { materialId: row.material_id, openPath } : {};
}

async function materialLinkForPlan(database: D1Database, planId: string): Promise<{ materialId?: string; openPath?: string }> {
  const row = await database.prepare(`SELECT material.id AS material_id, material.content_date AS material_date
    FROM study_plans AS plans
    LEFT JOIN study_content AS material ON material.id = CASE
      WHEN plans.root_plan_id LIKE 'content:%' THEN substr(plans.root_plan_id, 9)
      WHEN plans.id LIKE 'content:%' THEN substr(plans.id, 9)
      ELSE NULL END
    WHERE plans.id = ? LIMIT 1`).bind(planId).first<{ material_id: string | null; material_date: string | null }>();
  return row ? materialLink(row) : {};
}

function mapPlan(row: PlanRow): StudyPlanView {
  return {
    id: row.id,
    planDate: row.plan_date,
    category: row.category,
    title: row.title,
    detail: row.detail,
    minutes: row.minutes,
    completed: row.completed,
    status: statusFromRow(row),
    sourcePlanId: row.source_plan_id,
    rootPlanId: row.root_plan_id || row.id,
    updatedAt: row.updated_at || row.created_at,
    archivedAt: row.archived_at,
    archiveReason: row.archive_reason,
    ...materialLink(row),
  };
}

function mapLog(row: LogRow): StudyLogView {
  return {
    id: row.id,
    studyDate: row.study_date,
    part: row.part,
    title: row.title,
    minutes: row.minutes,
    score: row.score,
    note: row.note,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    confusedItems: row.confused_items,
    createdAt: row.created_at,
    ...materialLink(row),
  };
}

function dayDifference(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

export function weekRange(date: string): { start: string; end: string } {
  const current = new Date(`${date}T00:00:00Z`);
  const mondayOffset = (current.getUTCDay() + 6) % 7;
  const monday = new Date(current);
  monday.setUTCDate(current.getUTCDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

export function summarizeRecovery(
  overduePlans: StudyPlanView[],
  archivedPlans: StudyPlanView[],
  referenceDate: string,
  hasTodayPlans: boolean,
): RecoverySummary {
  const recent: StudyPlanView[] = [];
  const medium: StudyPlanView[] = [];
  const old: StudyPlanView[] = [];
  const ordered = [...overduePlans].sort((left, right) => left.planDate.localeCompare(right.planDate) || left.id.localeCompare(right.id));
  for (const plan of ordered) {
    const age = dayDifference(referenceDate, plan.planDate);
    if (age <= 7) recent.push(plan);
    else if (age <= 21) medium.push(plan);
    else old.push(plan);
  }

  const day = new Date(`${referenceDate}T00:00:00Z`).getUTCDay();
  const weekend = day === 0 || day === 6;
  const maxItems = hasTodayPlans ? 1 : weekend ? 2 : 1;
  const maxMinutes = weekend ? 60 : 30;
  const recommended: StudyPlanView[] = [];
  let usedMinutes = 0;
  // Plans older than 21 days stay visible, but are archive-only recommendations.
  // Recovery is always an explicit user choice; this list never mutates plans.
  for (const plan of [...medium, ...recent]) {
    if (recommended.length >= maxItems) break;
    if (usedMinutes + plan.minutes > maxMinutes) continue;
    recommended.push(plan);
    usedMinutes += plan.minutes;
  }

  return {
    totalCount: ordered.length,
    totalMinutes: ordered.reduce((sum, plan) => sum + plan.minutes, 0),
    oldestPlanDate: ordered[0]?.planDate ?? null,
    recent,
    medium,
    old,
    recommended,
    archived: archivedPlans,
  };
}

function languageGroup(part: string): 'english' | 'japanese' | 'toeic' | 'other' {
  const normalized = part.trim().toUpperCase();
  if (normalized === 'ENGLISH') return 'english';
  if (normalized === 'JAPANESE') return 'japanese';
  if (['TOEIC', 'LC', 'RC', 'VOCA', 'TEST'].includes(normalized)) return 'toeic';
  return 'other';
}

export async function readIntegrationStudy(database: D1Database, date: string) {
  if (!isDate(date)) throw new StudyCycleError(400, 'INVALID_DATE', 'date must use YYYY-MM-DD');
  const week = weekRange(date);
  const [todayResult, overdueResult, archivedResult, logsResult] = await Promise.all([
    database.prepare(`SELECT plans.*, material.id AS material_id, material.content_date AS material_date
      FROM study_plans AS plans
      LEFT JOIN study_content AS material ON material.id = CASE
        WHEN plans.root_plan_id LIKE 'content:%' THEN substr(plans.root_plan_id, 9)
        WHEN plans.id LIKE 'content:%' THEN substr(plans.id, 9)
        ELSE NULL END
      WHERE plans.plan_date = ? AND plans.status <> 'archived' ORDER BY plans.created_at ASC`)
      .bind(date).all<PlanRow>(),
    database.prepare(`SELECT plans.*, material.id AS material_id, material.content_date AS material_date
      FROM study_plans AS plans
      LEFT JOIN study_content AS material ON material.id = CASE
        WHEN plans.root_plan_id LIKE 'content:%' THEN substr(plans.root_plan_id, 9)
        WHEN plans.id LIKE 'content:%' THEN substr(plans.id, 9)
        ELSE NULL END
      WHERE plans.plan_date < ? AND plans.status = 'planned' ORDER BY plans.plan_date ASC, plans.created_at ASC`)
      .bind(date).all<PlanRow>(),
    database.prepare(`SELECT plans.*, material.id AS material_id, material.content_date AS material_date
      FROM study_plans AS plans
      LEFT JOIN study_content AS material ON material.id = CASE
        WHEN plans.root_plan_id LIKE 'content:%' THEN substr(plans.root_plan_id, 9)
        WHEN plans.id LIKE 'content:%' THEN substr(plans.id, 9)
        ELSE NULL END
      WHERE plans.status = 'archived' ORDER BY plans.archived_at DESC, plans.created_at DESC LIMIT 50`)
      .all<PlanRow>(),
    database.prepare(`SELECT logs.*, material.id AS material_id, material.content_date AS material_date
      FROM study_logs AS logs
      LEFT JOIN study_plans AS source_plan ON logs.source_type = 'plan' AND source_plan.id = logs.source_id
      LEFT JOIN study_content AS material ON material.id = CASE
        WHEN source_plan.root_plan_id LIKE 'content:%' THEN substr(source_plan.root_plan_id, 9)
        WHEN source_plan.id LIKE 'content:%' THEN substr(source_plan.id, 9)
        WHEN logs.source_type = 'material' AND EXISTS (SELECT 1 FROM study_content AS direct_content WHERE direct_content.id = logs.source_id) THEN logs.source_id
        WHEN logs.source_id LIKE 'content:%' THEN substr(logs.source_id, 9)
        ELSE NULL END
      WHERE logs.study_date BETWEEN ? AND ? AND logs.source_type <> 'legacy'
      ORDER BY logs.study_date ASC, logs.created_at ASC`)
      .bind(week.start, week.end).all<LogRow>(),
  ]);
  const todayPlans = (todayResult.results ?? []).map(mapPlan);
  const overduePlans = (overdueResult.results ?? []).map(mapPlan);
  const archivedPlans = (archivedResult.results ?? []).map(mapPlan);
  const logs = (logsResult.results ?? []).map(mapLog);
  const languageMinutes = { english: 0, japanese: 0, toeic: 0, other: 0 };
  for (const log of logs) languageMinutes[languageGroup(log.part)] += log.minutes;
  return {
    date,
    week,
    todayPlans,
    recovery: summarizeRecovery(overduePlans, archivedPlans, date, todayPlans.some((plan) => plan.status === 'planned')),
    completedLogs: logs,
    languageMinutes,
  };
}

function boundedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function commandMinutes(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(600, Math.max(1, Math.round(parsed))) : fallback;
}

function validateCommandInput(input: PlanCommandInput): void {
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(input.requestId)) {
    throw new StudyCycleError(400, 'INVALID_REQUEST_ID', 'request_id must be 8-128 safe characters');
  }
  if (!input.planId || input.planId.length > 140) throw new StudyCycleError(400, 'INVALID_PLAN_ID', 'plan_id is invalid');
  if (input.command === 'reschedule' && !isDate(input.targetDate)) {
    throw new StudyCycleError(400, 'INVALID_TARGET_DATE', 'target_date must use YYYY-MM-DD');
  }
}

function replayResult(row: EventRow, input: PlanCommandInput): PlanCommandResult {
  if (row.plan_id !== input.planId || row.event_type !== input.command || (row.target_date ?? null) !== (input.targetDate ?? null)) {
    throw new StudyCycleError(409, 'IDEMPOTENCY_KEY_REUSED', 'request_id was already used for another command');
  }
  try {
    const parsed = JSON.parse(row.result_json) as PlanCommandResult;
    return { ...parsed, replayed: true };
  } catch {
    throw new StudyCycleError(500, 'INVALID_EVENT_RESULT', 'stored command result is invalid');
  }
}

async function existingEvent(database: D1Database, requestId: string): Promise<EventRow | null> {
  return database.prepare(`SELECT plan_id, event_type, target_date, result_json
    FROM study_plan_events WHERE idempotency_key = ? LIMIT 1`).bind(requestId).first<EventRow>();
}

function eventStatement(
  database: D1Database,
  input: PlanCommandInput,
  fromStatus: PlanStatus,
  toStatus: PlanStatus,
  relatedPlanId: string | null,
  result: PlanCommandResult,
  now: string,
) {
  return database.prepare(`INSERT INTO study_plan_events
    (id, plan_id, event_type, from_status, to_status, related_plan_id, target_date, idempotency_key, result_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(), input.planId, input.command, fromStatus, toStatus, relatedPlanId,
      input.targetDate ?? null, input.requestId, JSON.stringify(result), now,
    );
}

function transitionAllowed(command: PlanCommand, status: PlanStatus): boolean {
  if (command === 'complete') return status === 'planned';
  if (command === 'undo-complete') return status === 'completed';
  if (command === 'reschedule' || command === 'archive') return status === 'planned';
  return status === 'archived';
}

export async function executePlanCommand(
  database: D1Database,
  input: PlanCommandInput,
  now = new Date().toISOString(),
): Promise<PlanCommandResult> {
  validateCommandInput(input);
  const prior = await existingEvent(database, input.requestId);
  if (prior) {
    const replayed = replayResult(prior, input);
    return {
      ...replayed,
      plan: { ...replayed.plan, ...await materialLinkForPlan(database, replayed.plan.id) },
      ...(replayed.createdPlan ? { createdPlan: { ...replayed.createdPlan, ...await materialLinkForPlan(database, replayed.createdPlan.id) } } : {}),
    };
  }

  const row = await database.prepare(`SELECT plans.*, material.id AS material_id, material.content_date AS material_date
    FROM study_plans AS plans
    LEFT JOIN study_content AS material ON material.id = CASE
      WHEN plans.root_plan_id LIKE 'content:%' THEN substr(plans.root_plan_id, 9)
      WHEN plans.id LIKE 'content:%' THEN substr(plans.id, 9)
      ELSE NULL END
    WHERE plans.id = ? LIMIT 1`).bind(input.planId).first<PlanRow>();
  if (!row) throw new StudyCycleError(404, 'PLAN_NOT_FOUND', 'plan not found');
  const plan = mapPlan(row);
  if (!transitionAllowed(input.command, plan.status)) {
    throw new StudyCycleError(409, 'INVALID_PLAN_TRANSITION', `cannot ${input.command} a ${plan.status} plan`);
  }
  if (input.command === 'reschedule' && input.targetDate === plan.planDate) {
    throw new StudyCycleError(409, 'INVALID_PLAN_TRANSITION', 'target_date must differ from the current plan date');
  }

  const toStatus: PlanStatus = input.command === 'complete'
    ? 'completed'
    : input.command === 'undo-complete' || input.command === 'restore'
      ? 'planned'
      : input.command === 'reschedule'
        ? 'rescheduled'
        : 'archived';
  let createdPlan: StudyPlanView | undefined;
  const statements: D1PreparedStatement[] = [];

  if (input.command === 'complete') {
    const completedPlan = { ...plan, completed: 1, status: 'completed' as const, updatedAt: now };
    const result: PlanCommandResult = { ok: true, replayed: false, command: input.command, plan: completedPlan };
    statements.push(
      database.prepare("UPDATE study_plans SET completed = 1, status = 'completed', updated_at = ?, archived_at = NULL, archive_reason = '' WHERE id = ? AND status = 'planned'").bind(now, plan.id),
      database.prepare(`INSERT INTO study_logs
        (id, study_date, part, title, minutes, score, note, source_type, source_id, source_label, confused_items, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'plan', ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET study_date = excluded.study_date, minutes = excluded.minutes,
          score = excluded.score, note = excluded.note, confused_items = excluded.confused_items, created_at = excluded.created_at`)
        .bind(`log:plan:${plan.id}`, plan.planDate, plan.category, plan.title, commandMinutes(input.minutes, plan.minutes), boundedText(input.score, 30), boundedText(input.note, 300), plan.id, plan.title, boundedText(input.confusedItems, 300), now),
      eventStatement(database, input, plan.status, toStatus, null, result, now),
    );
  } else if (input.command === 'undo-complete') {
    const restoredPlan = { ...plan, completed: 0, status: 'planned' as const, updatedAt: now };
    const result: PlanCommandResult = { ok: true, replayed: false, command: input.command, plan: restoredPlan };
    statements.push(
      database.prepare("UPDATE study_plans SET completed = 0, status = 'planned', updated_at = ? WHERE id = ? AND status = 'completed'").bind(now, plan.id),
      database.prepare("DELETE FROM study_logs WHERE id = ? AND source_type = 'plan'").bind(`log:plan:${plan.id}`),
      eventStatement(database, input, plan.status, toStatus, null, result, now),
    );
  } else if (input.command === 'reschedule') {
    const newId = crypto.randomUUID();
    const rootPlanId = plan.rootPlanId || plan.id;
    createdPlan = {
      ...plan,
      id: newId,
      planDate: input.targetDate!,
      completed: 0,
      status: 'planned',
      sourcePlanId: plan.id,
      rootPlanId,
      updatedAt: now,
      archivedAt: null,
      archiveReason: '',
    };
    const rescheduledPlan = { ...plan, completed: 2, status: 'rescheduled' as const, updatedAt: now };
    const result: PlanCommandResult = { ok: true, replayed: false, command: input.command, plan: rescheduledPlan, createdPlan };
    statements.push(
      database.prepare("UPDATE study_plans SET completed = 2, status = 'rescheduled', updated_at = ? WHERE id = ? AND status = 'planned'").bind(now, plan.id),
      database.prepare(`INSERT INTO study_plans
        (id, plan_date, category, title, detail, minutes, completed, source_plan_id, status, root_plan_id, created_at, updated_at, archived_at, archive_reason)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'planned', ?, ?, ?, NULL, '')`)
        .bind(newId, input.targetDate, plan.category, plan.title, plan.detail, plan.minutes, plan.id, rootPlanId, now, now),
      eventStatement(database, input, plan.status, toStatus, newId, result, now),
    );
  } else if (input.command === 'archive') {
    const reason = boundedText(input.archiveReason, 200);
    const archivedPlan = { ...plan, completed: 0, status: 'archived' as const, updatedAt: now, archivedAt: now, archiveReason: reason };
    const result: PlanCommandResult = { ok: true, replayed: false, command: input.command, plan: archivedPlan };
    statements.push(
      database.prepare("UPDATE study_plans SET completed = 0, status = 'archived', updated_at = ?, archived_at = ?, archive_reason = ? WHERE id = ? AND status = 'planned'").bind(now, now, reason, plan.id),
      eventStatement(database, input, plan.status, toStatus, null, result, now),
    );
  } else {
    const restoredPlan = { ...plan, completed: 0, status: 'planned' as const, updatedAt: now, archivedAt: null, archiveReason: '' };
    const result: PlanCommandResult = { ok: true, replayed: false, command: input.command, plan: restoredPlan };
    statements.push(
      database.prepare("UPDATE study_plans SET completed = 0, status = 'planned', updated_at = ?, archived_at = NULL, archive_reason = '' WHERE id = ? AND status = 'archived'").bind(now, plan.id),
      eventStatement(database, input, plan.status, toStatus, null, result, now),
    );
  }

  if (input.startMinute !== undefined && createdPlan) {
    if (input.startMinute !== null && (!Number.isInteger(input.startMinute) || input.startMinute < 0 || input.startMinute + plan.minutes > 1440)) {
      throw new StudyCycleError(400, 'INVALID_TIME', '시작 시각과 분량이 하루를 넘습니다.');
    }
    statements.push(database.prepare('INSERT INTO study_plan_slots(plan_id,start_minute) VALUES(?,?)').bind(createdPlan.id, input.startMinute));
  }
  if (input.scheduleGuard) {
    // Check the state observed above inside the same transaction as the transition.
    statements.unshift(database.prepare('INSERT INTO schedule_receipts(request_id,fingerprint,result_json) VALUES(?,?,?)').bind(
      input.requestId,
      JSON.stringify({ action: 'plan', planId: plan.id, expectedStatus: plan.status, expectedUpdatedAt: row.updated_at }),
      '{}',
    ));
  }
  try {
    await database.batch(statements);
  } catch (error) {
    const replay = await existingEvent(database, input.requestId);
    if (replay) {
      const replayed = replayResult(replay, input);
      return {
        ...replayed,
        plan: { ...replayed.plan, ...await materialLinkForPlan(database, replayed.plan.id) },
        ...(replayed.createdPlan ? { createdPlan: { ...replayed.createdPlan, ...await materialLinkForPlan(database, replayed.createdPlan.id) } } : {}),
      };
    }
    throw error;
  }

  const stored = await database.prepare('SELECT * FROM study_plans WHERE id = ? LIMIT 1').bind(plan.id).first<PlanRow>();
  if (!stored) throw new StudyCycleError(500, 'PLAN_UPDATE_FAILED', 'updated plan could not be read');
  const result: PlanCommandResult = {
    ok: true,
    replayed: false,
    command: input.command,
    plan: { ...mapPlan(stored), ...materialLink(row) },
    ...(createdPlan ? { createdPlan } : {}),
  };
  return result;
}
