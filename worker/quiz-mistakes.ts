import {
  quizItemFromMaterialBody,
  quizItemSnapshotFromJson,
  quizItemVersion,
  type QuizItemSnapshot,
  type StudyOption,
} from '../app/dashboard-utils.ts';

export type QuizLabel = StudyOption['label'];

type AttemptRow = {
  sequence: number;
  request_id: string;
  material_id: string;
  material_date: string;
  material_title: string;
  item_index: number;
  item_hash: string;
  item_json: string;
  selected_label: string;
  correct: number;
  resolved: number;
  attempted_at: string;
};

type MistakeRow = AttemptRow & {
  attempts: number;
  first_wrong_at: string;
  last_wrong_at: string;
};

export type QuizMistakeView = {
  id: string;
  latestRequestId: string;
  materialId: string;
  materialDate: string;
  materialTitle: string;
  itemIndex: number;
  itemHash: string;
  prompt: string;
  options: StudyOption[];
  selectedLabel: QuizLabel;
  correctLabel: QuizLabel;
  explanation: string;
  attempts: number;
  firstWrongAt: string;
  lastWrongAt: string;
};

type AttemptIdentity = { requestId: string; attemptedAt: string; selectedLabel: QuizLabel };

export class QuizMistakeError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'QuizMistakeError';
    this.status = status;
  }
}

export function isQuizLabel(value: unknown): value is QuizLabel {
  return typeof value === 'string' && /^[A-D]$/i.test(value);
}

export function isQuizRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function ensureQuizMistakesSchema(database: D1Database): Promise<void> {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS quiz_attempts (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      material_id TEXT NOT NULL,
      material_date TEXT NOT NULL,
      material_title TEXT NOT NULL,
      item_index INTEGER NOT NULL,
      item_hash TEXT NOT NULL,
      item_json TEXT NOT NULL,
      selected_label TEXT NOT NULL,
      correct INTEGER NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      attempted_at TEXT NOT NULL
    )`),
    database.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_attempts_request ON quiz_attempts(request_id)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_quiz_attempts_item ON quiz_attempts(material_id, item_index, item_hash, attempted_at DESC, sequence DESC)'),
    database.prepare('CREATE INDEX IF NOT EXISTS idx_quiz_attempts_time ON quiz_attempts(attempted_at DESC, sequence DESC)'),
  ]);
}

async function itemHash(itemJson: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(itemJson));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeAttemptedAt(value: string, now: string): string {
  const attempted = Date.parse(value);
  const received = Date.parse(now);
  if (!Number.isFinite(attempted) || !Number.isFinite(received) || Math.abs(attempted - received) > 10 * 60 * 1000) return now;
  return new Date(attempted).toISOString();
}

async function findAttemptReceipt(
  database: D1Database,
  input: AttemptIdentity & { materialId: string; itemIndex: number; itemVersion?: string; itemHash?: string },
): Promise<{ correct: boolean; resolved: boolean; itemHash: string } | null> {
  const receipt = await database.prepare(`SELECT material_id, item_index, item_hash, item_json, selected_label, correct, resolved
    FROM quiz_attempts WHERE request_id = ? LIMIT 1`)
    .bind(input.requestId)
    .first<Pick<AttemptRow, 'material_id' | 'item_index' | 'item_hash' | 'item_json' | 'selected_label' | 'correct' | 'resolved'>>();
  if (!receipt) return null;
  const sameAttempt = receipt.material_id === input.materialId
    && Number(receipt.item_index) === input.itemIndex
    && receipt.selected_label === input.selectedLabel.toUpperCase()
    && (input.itemVersion === undefined || receipt.item_json === input.itemVersion)
    && (input.itemHash === undefined || receipt.item_hash === input.itemHash);
  if (!sameAttempt) throw new QuizMistakeError('Quiz request ID was already used for another answer', 409);
  return { correct: receipt.correct === 1, resolved: receipt.resolved === 1, itemHash: receipt.item_hash };
}

async function appendAttempt(
  database: D1Database,
  identity: AttemptIdentity,
  material: { id: string; date: string; title: string },
  itemIndex: number,
  item: QuizItemSnapshot,
  hash: string,
  now: string,
): Promise<{ correct: boolean; resolved: boolean; itemHash: string }> {
  const existingReceipt = await findAttemptReceipt(database, {
    ...identity,
    materialId: material.id,
    itemIndex,
    itemHash: hash,
  });
  if (existingReceipt) return existingReceipt;

  const selectedLabel = identity.selectedLabel.toUpperCase() as QuizLabel;
  const correct = selectedLabel === item.correctLabel;
  const resolved = correct;
  const itemJson = quizItemVersion(item);
  await database.prepare(`INSERT OR IGNORE INTO quiz_attempts
    (request_id, material_id, material_date, material_title, item_index, item_hash, item_json,
      selected_label, correct, resolved, attempted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      identity.requestId,
      material.id,
      material.date,
      material.title,
      itemIndex,
      hash,
      itemJson,
      selectedLabel,
      correct ? 1 : 0,
      resolved ? 1 : 0,
      normalizeAttemptedAt(identity.attemptedAt, now),
    )
    .run();

  const receipt = await findAttemptReceipt(database, {
    ...identity,
    materialId: material.id,
    itemIndex,
    itemHash: hash,
  });
  if (!receipt) throw new QuizMistakeError('TOEIC answer could not be saved', 500);
  return receipt;
}

export async function recordQuizAnswer(
  database: D1Database,
  input: AttemptIdentity & { materialId: string; itemIndex: number; itemVersion: string },
  now = new Date().toISOString(),
): Promise<{ correct: boolean; resolved: boolean; itemHash: string }> {
  const existing = await findAttemptReceipt(database, input);
  if (existing) return existing;
  const material = await database.prepare("SELECT id, content_date, title, body_json FROM study_content WHERE id = ? AND kind = 'toeic' LIMIT 1")
    .bind(input.materialId)
    .first<{ id: string; content_date: string; title: string; body_json: string }>();
  if (!material) throw new QuizMistakeError('TOEIC material not found', 404);

  const item = quizItemFromMaterialBody(material.body_json, input.itemIndex);
  if (!item) throw new QuizMistakeError('TOEIC quiz item not found', 400);
  const currentVersion = quizItemVersion(item);
  if (input.itemVersion !== currentVersion) {
    throw new QuizMistakeError('학습 자료가 갱신되었습니다. 새 문제를 불러온 뒤 다시 선택해 주세요.', 409);
  }
  return appendAttempt(
    database,
    input,
    { id: material.id, date: material.content_date, title: material.title },
    input.itemIndex,
    item,
    await itemHash(currentVersion),
    now,
  );
}

export async function recordSavedQuizAnswer(
  database: D1Database,
  input: AttemptIdentity & { materialId: string; itemIndex: number; itemHash: string },
  now = new Date().toISOString(),
): Promise<{ correct: boolean; resolved: boolean; itemHash: string }> {
  const existing = await findAttemptReceipt(database, input);
  if (existing) return existing;
  const saved = await database.prepare(`SELECT material_id, material_date, material_title, item_index, item_hash, item_json
    FROM quiz_attempts WHERE material_id = ? AND item_index = ? AND item_hash = ?
    ORDER BY attempted_at DESC, sequence DESC LIMIT 1`)
    .bind(input.materialId, input.itemIndex, input.itemHash)
    .first<Pick<AttemptRow, 'material_id' | 'material_date' | 'material_title' | 'item_index' | 'item_hash' | 'item_json'>>();
  if (!saved) throw new QuizMistakeError('TOEIC mistake not found', 404);
  const item = quizItemSnapshotFromJson(saved.item_json);
  if (!item || await itemHash(saved.item_json) !== saved.item_hash) throw new QuizMistakeError('Saved TOEIC quiz item is invalid', 500);
  return appendAttempt(
    database,
    input,
    { id: saved.material_id, date: saved.material_date, title: saved.material_title },
    Number(saved.item_index),
    item,
    saved.item_hash,
    now,
  );
}

export async function listQuizMistakes(database: D1Database, limit = 100): Promise<QuizMistakeView[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await database.prepare(`WITH ranked AS (
    SELECT qa.*,
      ROW_NUMBER() OVER (
        PARTITION BY material_id, item_index, item_hash
        ORDER BY attempted_at DESC, sequence DESC
      ) AS attempt_rank,
      SUM(CASE WHEN correct = 0 THEN 1 ELSE 0 END) OVER (
        PARTITION BY material_id, item_index, item_hash
      ) AS attempts,
      MIN(CASE WHEN correct = 0 THEN attempted_at END) OVER (
        PARTITION BY material_id, item_index, item_hash
      ) AS first_wrong_at,
      MAX(CASE WHEN correct = 0 THEN attempted_at END) OVER (
        PARTITION BY material_id, item_index, item_hash
      ) AS last_wrong_at
    FROM quiz_attempts qa
  )
  SELECT * FROM ranked
  WHERE attempt_rank = 1 AND correct = 0
  ORDER BY attempted_at DESC, sequence DESC
  LIMIT ?`)
    .bind(safeLimit)
    .all<MistakeRow>();

  return (result.results ?? []).flatMap((row) => {
    const item = quizItemSnapshotFromJson(row.item_json);
    if (!item || !isQuizLabel(row.selected_label)) return [];
    return [{
      id: `${row.material_id}:${row.item_index}:${row.item_hash}`,
      latestRequestId: row.request_id,
      materialId: row.material_id,
      materialDate: row.material_date,
      materialTitle: row.material_title,
      itemIndex: Number(row.item_index),
      itemHash: row.item_hash,
      prompt: item.prompt,
      options: item.options,
      selectedLabel: row.selected_label.toUpperCase() as QuizLabel,
      correctLabel: item.correctLabel,
      explanation: item.explanation,
      attempts: Number(row.attempts),
      firstWrongAt: row.first_wrong_at,
      lastWrongAt: row.last_wrong_at,
    }];
  });
}
