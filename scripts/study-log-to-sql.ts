import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  isContentKind,
  isDate,
  parseStudyPayload,
  type ContentKind,
  type StudyPayload,
} from '../worker/types.ts';

const MAX_FILE_BYTES = 96 * 1024;
const FRONTMATTER_KEYS = new Set(['date', 'kind', 'source', 'automation_id', 'generated_at']);
const PAYLOAD_KEYS = new Set(['title', 'summary', 'speakingSentence', 'speakingMeaning', 'items']);
const ITEM_KEYS = new Set(['prompt', 'options', 'answer', 'explanation']);
const OPTION_KEYS = new Set(['label', 'text']);
const EXPECTED_ITEMS: Record<ContentKind, number> = { english: 5, japanese: 5, toeic: 10 };
const SENSITIVE_PATTERNS = [
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:CLOUDFLARE_API_TOKEN|TELEGRAM_BOT_TOKEN|ADMIN_TOKEN)\s*[:=]/i,
  /\bAuthorization\s*:\s*Bearer\s+\S+/i,
];

type Frontmatter = {
  date: string;
  kind: ContentKind;
  source: 'chatgpt-automation';
  automationId: string;
  generatedAt: string;
};

export type ParsedStudyLog = Frontmatter & {
  path: string;
  payload: StudyPayload;
};

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function assertSafeText(path: string, label: string, value: unknown, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) fail(path, `${label} must be a non-empty string`);
  if (value.trim().length > max) fail(path, `${label} exceeds ${max} characters`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    fail(path, `${label} contains a disallowed control character`);
  }
}

function parseFrontmatter(path: string, text: string): { frontmatter: Frontmatter; body: string } {
  if (!text.startsWith('---\n')) fail(path, 'YAML frontmatter must be the first block');
  const closing = text.indexOf('\n---\n', 4);
  if (closing < 0) fail(path, 'YAML frontmatter is not closed');

  const values = new Map<string, string>();
  for (const line of text.slice(4, closing).split('\n')) {
    const match = line.match(/^([a-z_]+):\s*"([^"\r\n]*)"\s*$/);
    if (!match) fail(path, `invalid frontmatter line: ${line}`);
    const [, key, value] = match;
    if (!FRONTMATTER_KEYS.has(key)) fail(path, `unsupported frontmatter key: ${key}`);
    if (values.has(key)) fail(path, `duplicate frontmatter key: ${key}`);
    values.set(key, value);
  }
  for (const key of FRONTMATTER_KEYS) {
    if (!values.has(key)) fail(path, `missing frontmatter key: ${key}`);
  }

  const date = values.get('date')!;
  const kind = values.get('kind')!;
  const source = values.get('source')!;
  const automationId = values.get('automation_id')!;
  const generatedAt = values.get('generated_at')!;
  if (!isDate(date)) fail(path, 'date must be a real calendar date in YYYY-MM-DD format');
  if (!isContentKind(kind)) fail(path, 'kind must be english, japanese, or toeic');
  if (source !== 'chatgpt-automation') fail(path, 'source must be chatgpt-automation');
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(automationId)) fail(path, 'automation_id format is invalid');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?\+09:00$/.test(generatedAt)) {
    fail(path, 'generated_at must be an ISO 8601 Asia/Seoul timestamp with +09:00');
  }
  if (Number.isNaN(new Date(generatedAt).valueOf()) || generatedAt.slice(0, 10) !== date) {
    fail(path, 'generated_at must be valid and use the same KST date');
  }

  return {
    frontmatter: { date, kind, source, automationId, generatedAt },
    body: text.slice(closing + 5),
  };
}

function validatePayload(path: string, kind: ContentKind, value: unknown): StudyPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'structured data must be a JSON object');
  const record = value as Record<string, unknown>;
  if (!hasOnlyKeys(record, PAYLOAD_KEYS)) fail(path, 'structured data contains an unsupported key');
  assertSafeText(path, 'title', record.title, 120);
  assertSafeText(path, 'summary', record.summary, 500);

  for (const key of ['speakingSentence', 'speakingMeaning'] as const) {
    if (record[key] !== undefined) assertSafeText(path, key, record[key], 300);
  }
  const hasSpeakingSentence = record.speakingSentence !== undefined;
  const hasSpeakingMeaning = record.speakingMeaning !== undefined;
  if (hasSpeakingSentence !== hasSpeakingMeaning) {
    fail(path, 'speakingSentence and speakingMeaning must be provided together');
  }
  if (kind !== 'toeic' && !hasSpeakingSentence) {
    fail(path, `${kind} must include a speaking sentence and meaning`);
  }
  if (!Array.isArray(record.items) || record.items.length !== EXPECTED_ITEMS[kind]) {
    fail(path, `${kind} must contain exactly ${EXPECTED_ITEMS[kind]} items`);
  }
  record.items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(path, `items[${index}] must be an object`);
    const itemRecord = item as Record<string, unknown>;
    if (!hasOnlyKeys(itemRecord, ITEM_KEYS)) fail(path, `items[${index}] contains an unsupported key`);
    assertSafeText(path, `items[${index}].prompt`, itemRecord.prompt, 500);
    if (itemRecord.options !== undefined) {
      if (!Array.isArray(itemRecord.options) || itemRecord.options.length !== 4) fail(path, `items[${index}].options must contain A, B, C, D`);
      const labels = ['A', 'B', 'C', 'D'];
      itemRecord.options.forEach((option, optionIndex) => {
        if (!option || typeof option !== 'object' || Array.isArray(option)) fail(path, `items[${index}].options[${optionIndex}] must be an object`);
        const optionRecord = option as Record<string, unknown>;
        if (!hasOnlyKeys(optionRecord, OPTION_KEYS)) fail(path, `items[${index}].options[${optionIndex}] contains an unsupported key`);
        if (optionRecord.label !== labels[optionIndex]) fail(path, `items[${index}].options labels must be A, B, C, D in order`);
        assertSafeText(path, `items[${index}].options[${optionIndex}].text`, optionRecord.text, 240);
      });
    }
    assertSafeText(path, `items[${index}].answer`, itemRecord.answer, 1000);
    assertSafeText(path, `items[${index}].explanation`, itemRecord.explanation, 1000);
  });
  return parseStudyPayload(record);
}

export function parseStudyLog(relativePath: string, rawText: string): ParsedStudyLog {
  const path = relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
  const bytes = Buffer.byteLength(rawText, 'utf8');
  if (bytes === 0 || bytes > MAX_FILE_BYTES) fail(path, `file must be between 1 and ${MAX_FILE_BYTES} bytes`);
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(rawText))) {
    fail(path, 'file appears to contain a token, private key, or authorization secret');
  }

  const pathMatch = path.match(/^study-logs\/(\d{4})\/(\d{2})\/(\d{2})\/(english|japanese|toeic)\.md$/);
  if (!pathMatch) fail(path, 'path must be study-logs/YYYY/MM/DD/{english|japanese|toeic}.md');
  const pathDate = `${pathMatch[1]}-${pathMatch[2]}-${pathMatch[3]}`;
  const pathKind = pathMatch[4] as ContentKind;
  if (!isDate(pathDate)) fail(path, 'path contains an invalid calendar date');

  const normalized = rawText.replaceAll('\r\n', '\n');
  const { frontmatter, body } = parseFrontmatter(path, normalized);
  if (frontmatter.date !== pathDate || frontmatter.kind !== pathKind) {
    fail(path, 'frontmatter date and kind must match the file path');
  }
  const h1 = body.match(/^#\s+(.+)$/m)?.[1].trim();
  if (!h1) fail(path, 'Markdown body must contain an H1 title');

  const jsonBlocks = [...body.matchAll(/```json[ \t]*\n([\s\S]*?)\n```/gi)];
  if (jsonBlocks.length !== 1) fail(path, 'Markdown body must contain exactly one fenced json block');
  if (!/##\s+구조화 데이터\s*\n\s*```json/i.test(body)) {
    fail(path, 'the json block must be under a 구조화 데이터 heading');
  }
  const trailing = body.slice((jsonBlocks[0].index ?? 0) + jsonBlocks[0][0].length).trim();
  if (trailing) fail(path, 'the structured data block must be the final content in the file');

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlocks[0][1]) as unknown;
  } catch {
    fail(path, 'structured data block is not valid JSON');
  }

  const payload = validatePayload(path, frontmatter.kind, parsed);
  if (h1 !== payload.title) fail(path, 'Markdown H1 must match the structured title');
  return { ...frontmatter, path, payload };
}

export function sqlLiteral(value: string): string {
  if (value.includes('\u0000')) throw new Error('SQL values cannot contain NUL bytes');
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildStudyLogSql(logs: ParsedStudyLog[]): string {
  if (logs.length === 0) throw new Error('At least one study log is required');
  const uniquePaths = new Set<string>();
  const uniqueSlots = new Set<string>();
  const statements: string[] = ['-- Generated by scripts/study-log-to-sql.ts. Do not commit this file.'];

  for (const log of logs) {
    if (uniquePaths.has(log.path)) throw new Error(`Duplicate study log path: ${log.path}`);
    const slot = `${log.date}:${log.kind}`;
    if (uniqueSlots.has(slot)) throw new Error(`Duplicate study log date and kind: ${slot}`);
    uniquePaths.add(log.path);
    uniqueSlots.add(slot);

    const payloadJson = JSON.stringify(log.payload);
    const timestamp = new Date(log.generatedAt).toISOString();
    const contentId = `content:chatgpt:${log.date}:${log.kind}`;
    const category = log.kind.toUpperCase();
    const minutes = log.kind === 'toeic' ? 45 : 20;
    const model = `chatgpt-automation/${log.automationId}`;
    const detail = log.payload.summary.slice(0, 120);

    const contentValues = [
      contentId,
      log.date,
      log.kind,
      log.payload.title,
      log.payload.summary,
      payloadJson,
      model,
      timestamp,
      timestamp,
    ].map(sqlLiteral);
    statements.push(`INSERT INTO study_content
  (id, content_date, kind, title, summary, body_json, model, status, created_at, updated_at)
VALUES (${contentValues.slice(0, 7).join(', ')}, 'ready', ${contentValues.slice(7).join(', ')})
ON CONFLICT(content_date, kind) DO UPDATE SET
  title = excluded.title,
  summary = excluded.summary,
  body_json = excluded.body_json,
  model = excluded.model,
  status = 'ready',
  updated_at = excluded.updated_at
WHERE (study_content.title <> excluded.title
   OR study_content.summary <> excluded.summary
   OR study_content.body_json <> excluded.body_json
   OR study_content.model <> excluded.model
   OR study_content.status <> 'ready')
AND (study_content.model NOT LIKE 'chatgpt-automation/%'
  OR (study_content.model = excluded.model AND excluded.updated_at >= study_content.updated_at));`);

    statements.push(`INSERT INTO study_plans
  (id, plan_date, category, title, detail, minutes, completed, created_at)
SELECT 'content:' || id, content_date, ${sqlLiteral(category)}, title, ${sqlLiteral(detail)}, ${minutes}, 0, ${sqlLiteral(timestamp)}
FROM study_content
WHERE content_date = ${sqlLiteral(log.date)}
  AND kind = ${sqlLiteral(log.kind)}
  AND model = ${sqlLiteral(model)}
  AND updated_at = ${sqlLiteral(timestamp)}
ON CONFLICT(id) DO UPDATE SET
  plan_date = excluded.plan_date,
  category = excluded.category,
  title = excluded.title,
  detail = excluded.detail,
  minutes = excluded.minutes
WHERE study_plans.plan_date <> excluded.plan_date
   OR study_plans.category <> excluded.category
   OR study_plans.title <> excluded.title
   OR study_plans.detail <> excluded.detail
   OR study_plans.minutes <> excluded.minutes;`);
  }

  return `${statements.join('\n\n')}\n`;
}

function readLogs(paths: string[]): ParsedStudyLog[] {
  return paths.map((path) => parseStudyLog(path, readFileSync(path, 'utf8')));
}

function runCli(args: string[]): void {
  if (args[0] === '--check') {
    if (args.length < 2) throw new Error('Usage: study-log-to-sql.ts --check FILE...');
    const logs = readLogs(args.slice(1));
    process.stdout.write(`Validated ${logs.length} study log file(s).\n`);
    return;
  }
  if (args[0] === '--check-owner') {
    if (args.length < 3) throw new Error('Usage: study-log-to-sql.ts --check-owner BASE_SHA FILE...');
    const [baseSha, ...paths] = args.slice(1);
    const logs = readLogs(paths);
    for (const log of logs) {
      let exists = true;
      try {
        execFileSync('git', ['cat-file', '-e', `${baseSha}:${log.path}`], { stdio: 'ignore' });
      } catch {
        exists = false;
      }
      if (!exists) continue;
      const previousText = execFileSync('git', ['show', `${baseSha}:${log.path}`], {
        encoding: 'utf8',
        maxBuffer: MAX_FILE_BYTES + 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const previous = parseStudyLog(log.path, previousText);
      if (previous.automationId !== log.automationId) {
        fail(log.path, 'automation_id cannot replace a file owned by another scheduled task');
      }
    }
    process.stdout.write(`Verified ownership for ${logs.length} study log file(s).\n`);
    return;
  }
  if (args.length < 2) throw new Error('Usage: study-log-to-sql.ts OUTPUT.sql FILE...');
  const [output, ...paths] = args;
  const sql = buildStudyLogSql(readLogs(paths));
  writeFileSync(output, sql, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`Prepared ${paths.length} study log file(s) for D1 sync.\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown validation error';
    process.stderr.write(`Study log validation failed: ${message}\n`);
    process.exitCode = 1;
  }
}
