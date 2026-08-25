import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildStudyLogSql, parseStudyLog, sqlLiteral } from '../scripts/study-log-to-sql.ts';

function studyLog(overrides: { date?: string; kind?: 'english' | 'japanese' | 'toeic'; source?: string; items?: number; title?: string } = {}) {
  const date = overrides.date ?? '2026-08-25';
  const kind = overrides.kind ?? 'english';
  const itemCount = overrides.items ?? (kind === 'toeic' ? 10 : 5);
  const title = overrides.title ?? "Today's English";
  const items = Array.from({ length: itemCount }, (_, index) => ({
    prompt: `Prompt ${index + 1}`,
    answer: `Answer ${index + 1}`,
    explanation: `Explanation ${index + 1}`,
  }));
  const payload = {
    title,
    summary: 'A practical daily lesson',
    ...(kind === 'toeic' ? {} : { speakingSentence: 'Could you clarify that?', speakingMeaning: '그 점을 명확히 해주시겠어요?' }),
    items,
  };
  return `---
date: "${date}"
kind: "${kind}"
source: "${overrides.source ?? 'chatgpt-automation'}"
automation_id: "6a88f71bcde08191a07c7b9ec1daab1f"
generated_at: "${date}T06:30:00+09:00"
---

# ${title}

A practical daily lesson

## 전체 학습 항목

1. Prompt 1

## 구조화 데이터

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\``;
}

test('parses the canonical Markdown format and path', () => {
  const parsed = parseStudyLog('study-logs/2026/08/25/english.md', studyLog());
  assert.equal(parsed.date, '2026-08-25');
  assert.equal(parsed.kind, 'english');
  assert.equal(parsed.payload.items.length, 5);
  assert.equal(parsed.payload.title, "Today's English");
});

test('supports the ten-item TOEIC contract', () => {
  const parsed = parseStudyLog('study-logs/2026/08/25/toeic.md', studyLog({ kind: 'toeic' }));
  assert.equal(parsed.payload.items.length, 10);
  assert.equal(parsed.payload.speakingSentence, undefined);
});

test('rejects invalid dates and path/frontmatter mismatches', () => {
  assert.throws(
    () => parseStudyLog('study-logs/2026/02/30/english.md', studyLog({ date: '2026-02-30' })),
    /invalid calendar date|real calendar date/,
  );
  assert.throws(
    () => parseStudyLog('study-logs/2026/08/26/english.md', studyLog()),
    /must match the file path/,
  );
});

test('rejects an unexpected source, item count, or duplicate JSON block', () => {
  assert.throws(
    () => parseStudyLog('study-logs/2026/08/25/english.md', studyLog({ source: 'manual' })),
    /source must be chatgpt-automation/,
  );
  assert.throws(
    () => parseStudyLog('study-logs/2026/08/25/english.md', studyLog({ items: 4 })),
    /exactly 5 items/,
  );
  const duplicated = `${studyLog()}\n\n\`\`\`json\n{}\n\`\`\``;
  assert.throws(
    () => parseStudyLog('study-logs/2026/08/25/english.md', duplicated),
    /exactly one fenced json block|final content/,
  );
});

test('requires matching human and structured titles plus paired speaking fields', () => {
  assert.throws(
    () => parseStudyLog('study-logs/2026/08/25/english.md', studyLog().replace('# Today\'s English', '# A different title')),
    /H1 must match/,
  );
  const missingMeaning = studyLog().replace(/,\n  "speakingMeaning": "[^"]+"/, '');
  assert.throws(
    () => parseStudyLog('study-logs/2026/08/25/english.md', missingMeaning),
    /must be provided together/,
  );
});

test('rejects oversized files and common secret formats', () => {
  assert.throws(
    () => parseStudyLog('study-logs/2026/08/25/english.md', `${studyLog()}${'x'.repeat(96 * 1024)}`),
    /file must be between/,
  );
  assert.throws(
    () => parseStudyLog('study-logs/2026/08/25/english.md', studyLog().replace('A practical daily lesson', 'Authorization: Bearer secret-value')),
    /appears to contain/,
  );
});

test('SQL generation is idempotent and escapes quotes as data', () => {
  const parsed = parseStudyLog(
    'study-logs/2026/08/25/english.md',
    studyLog({ title: "Today's lesson'); DROP TABLE study_content; --" }),
  );
  const sql = buildStudyLogSql([parsed]);
  assert.match(sql, /ON CONFLICT\(content_date, kind\) DO UPDATE/);
  assert.match(sql, /WHERE \(study_content\.title <> excluded\.title/);
  assert.match(sql, /Today''s lesson''\); DROP TABLE study_content; --/);
  assert.equal(sqlLiteral("O'Reilly"), "'O''Reilly'");
});

test('SQL generation rejects duplicate date and kind slots', () => {
  const parsed = parseStudyLog('study-logs/2026/08/25/english.md', studyLog());
  assert.throws(() => buildStudyLogSql([parsed, { ...parsed, path: 'study-logs/duplicate.md' }]), /Duplicate study log date and kind/);
});

test('generated SQL upserts one content row and preserves plan completion', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE study_content (
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
  );
  CREATE UNIQUE INDEX uq_study_content_date_kind ON study_content(content_date, kind);
  CREATE TABLE study_plans (
    id TEXT PRIMARY KEY,
    plan_date TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    minutes INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`);

  const path = 'study-logs/2026/08/25/english.md';
  const first = parseStudyLog(path, studyLog());
  database.exec(buildStudyLogSql([first]));
  const original = database.prepare('SELECT id, title FROM study_content').get() as { id: string; title: string };
  database.exec('UPDATE study_plans SET completed = 1');

  const changedTitle = "Updated lesson'); DROP TABLE study_content; --";
  const changed = {
    ...parseStudyLog(path, studyLog({ title: changedTitle })),
    generatedAt: '2026-08-25T06:31:00+09:00',
  };
  database.exec(buildStudyLogSql([changed]));
  database.exec(buildStudyLogSql([changed]));

  const content = database.prepare('SELECT id, title FROM study_content').get() as { id: string; title: string };
  const plan = database.prepare('SELECT title, completed FROM study_plans').get() as { title: string; completed: number };
  const count = database.prepare('SELECT COUNT(*) AS total FROM study_content').get() as { total: number };
  assert.equal(content.id, original.id);
  assert.equal(content.title, changedTitle);
  assert.equal(plan.title, changedTitle);
  assert.equal(plan.completed, 1);
  assert.equal(count.total, 1);

  const otherAutomation = { ...changed, automationId: 'different-automation-id', payload: { ...changed.payload, title: 'Unexpected overwrite' } };
  database.exec(buildStudyLogSql([otherAutomation]));
  const protectedContent = database.prepare('SELECT title FROM study_content').get() as { title: string };
  const protectedPlan = database.prepare('SELECT title FROM study_plans').get() as { title: string };
  assert.equal(protectedContent.title, changedTitle);
  assert.equal(protectedPlan.title, changedTitle);

  const stale = { ...changed, generatedAt: '2026-08-25T06:30:00+09:00', payload: { ...changed.payload, title: 'Stale lesson' } };
  database.exec(buildStudyLogSql([stale]));
  const freshContent = database.prepare('SELECT title FROM study_content').get() as { title: string };
  const freshPlan = database.prepare('SELECT title FROM study_plans').get() as { title: string };
  assert.equal(freshContent.title, changedTitle);
  assert.equal(freshPlan.title, changedTitle);
  database.close();
});
