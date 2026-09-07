import assert from 'node:assert/strict';
import test from 'node:test';

import { Miniflare } from 'miniflare';

import { quizItemFromMaterialBody, quizItemVersion } from '../app/dashboard-utils.ts';
import { ensureQuizMistakesSchema, listQuizMistakes, QuizMistakeError, recordQuizAnswer, recordSavedQuizAnswer } from './quiz-mistakes.ts';

function materialBody(firstAnswer = 'B') {
  return JSON.stringify({
    items: [
      {
        prompt: firstAnswer === 'B' ? 'The memo was distributed _____ to all employees.' : 'The memo was _____ yesterday.',
        options: firstAnswer === 'B' ? [
          { label: 'A', text: 'prompt' },
          { label: 'B', text: 'promptly' },
          { label: 'C', text: 'promptness' },
          { label: 'D', text: 'prompted' },
        ] : [
          { label: 'A', text: 'sent' },
          { label: 'B', text: 'send' },
          { label: 'C', text: 'sending' },
          { label: 'D', text: 'sends' },
        ],
        answer: firstAnswer === 'B' ? '정답: B. promptly. 완성 표현: was distributed promptly' : '정답: A. sent. 수동태 표현',
        explanation: firstAnswer === 'B' ? '동사를 꾸미는 부사 promptly가 알맞습니다.' : '수동태에는 과거분사가 필요합니다.',
      },
      {
        prompt: 'The report _____ by Friday.',
        options: [
          { label: 'A', text: 'completes' },
          { label: 'B', text: 'completed' },
          { label: 'C', text: 'will have completed' },
          { label: 'D', text: 'completing' },
        ],
        answer: 'C. will have completed — future perfect',
        explanation: '미래의 특정 시점 전 완료는 미래완료를 씁니다.',
      },
    ],
  });
}

function requestId(number: number) {
  return `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function identity(number: number, selectedLabel: 'A' | 'B' | 'C' | 'D', attemptedAt: string) {
  return { requestId: requestId(number), selectedLabel, attemptedAt };
}

async function setupDatabase(context: test.TestContext) {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    compatibilityDate: '2026-05-22',
    d1Databases: ['DB'],
  });
  context.after(() => mf.dispose());
  const database = await mf.getD1Database('DB');
  await database.prepare(`CREATE TABLE study_content (
    id TEXT PRIMARY KEY, content_date TEXT NOT NULL, kind TEXT NOT NULL,
    title TEXT NOT NULL, body_json TEXT NOT NULL
  )`).run();
  await database.prepare(`INSERT INTO study_content (id, content_date, kind, title, body_json)
    VALUES ('toeic-1', '2026-09-07', 'toeic', 'TOEIC 실전 10문제', ?)`)
    .bind(materialBody())
    .run();
  await ensureQuizMistakesSchema(database);
  return database;
}

test('quiz attempts keep only unresolved wrong items and deduplicate request retries', async (context) => {
  const database = await setupDatabase(context);
  const firstVersion = quizItemVersion(quizItemFromMaterialBody(materialBody(), 0)!);
  const secondVersion = quizItemVersion(quizItemFromMaterialBody(materialBody(), 1)!);
  const firstWrongAt = '2026-09-07T09:00:00.000Z';
  const secondWrongAt = '2026-09-07T09:05:00.000Z';

  const correctFirst = await recordQuizAnswer(database, {
    materialId: 'toeic-1', itemIndex: 0, itemVersion: firstVersion,
    ...identity(1, 'B', firstWrongAt),
  }, firstWrongAt);
  assert.equal(correctFirst.correct, true);
  assert.equal((await listQuizMistakes(database)).length, 0);

  const wrongRequest = {
    materialId: 'toeic-1', itemIndex: 0, itemVersion: firstVersion,
    ...identity(2, 'A', firstWrongAt),
  };
  const firstWrong = await recordQuizAnswer(database, wrongRequest, firstWrongAt);
  await recordQuizAnswer(database, wrongRequest, firstWrongAt);
  await recordQuizAnswer(database, {
    materialId: 'toeic-1', itemIndex: 0, itemVersion: firstVersion,
    ...identity(3, 'D', secondWrongAt),
  }, secondWrongAt);
  await recordQuizAnswer(database, {
    materialId: 'toeic-1', itemIndex: 1, itemVersion: secondVersion,
    ...identity(4, 'A', secondWrongAt),
  }, secondWrongAt);

  const mistakes = await listQuizMistakes(database);
  assert.equal(mistakes.length, 2);
  assert.equal(mistakes.find((item) => item.itemIndex === 0)?.selectedLabel, 'D');
  assert.equal(mistakes.find((item) => item.itemIndex === 0)?.attempts, 2);
  assert.equal(mistakes.find((item) => item.itemIndex === 0)?.correctLabel, 'B');
  assert.equal(mistakes.find((item) => item.itemIndex === 0)?.itemHash, firstWrong.itemHash);

  const resolved = await recordSavedQuizAnswer(database, {
    materialId: 'toeic-1', itemIndex: 0, itemHash: firstWrong.itemHash,
    ...identity(5, 'B', '2026-09-07T09:10:00.000Z'),
  }, '2026-09-07T09:10:00.000Z');
  assert.equal(resolved.correct, true);
  const remaining = await listQuizMistakes(database);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].itemIndex, 1);
});

test('saved mistakes retain their original question when source material changes', async (context) => {
  const database = await setupDatabase(context);
  const oldVersion = quizItemVersion(quizItemFromMaterialBody(materialBody(), 0)!);
  const wrong = await recordQuizAnswer(database, {
    materialId: 'toeic-1', itemIndex: 0, itemVersion: oldVersion,
    ...identity(10, 'A', '2026-09-07T10:00:00.000Z'),
  }, '2026-09-07T10:00:00.000Z');

  await database.prepare('UPDATE study_content SET body_json = ? WHERE id = ?').bind(materialBody('A'), 'toeic-1').run();
  const saved = await listQuizMistakes(database);
  assert.equal(saved[0].prompt, 'The memo was distributed _____ to all employees.');
  assert.equal(saved[0].correctLabel, 'B');

  await assert.rejects(
    recordQuizAnswer(database, {
      materialId: 'toeic-1', itemIndex: 0, itemVersion: oldVersion,
      ...identity(11, 'A', '2026-09-07T10:02:00.000Z'),
    }, '2026-09-07T10:02:00.000Z'),
    (error: unknown) => error instanceof QuizMistakeError && error.status === 409,
  );

  const resolved = await recordSavedQuizAnswer(database, {
    materialId: 'toeic-1', itemIndex: 0, itemHash: wrong.itemHash,
    ...identity(12, 'B', '2026-09-07T10:03:00.000Z'),
  }, '2026-09-07T10:03:00.000Z');
  assert.equal(resolved.correct, true);
  assert.equal((await listQuizMistakes(database)).length, 0);
});

test('receipt retries survive source updates and click time determines the latest state', async (context) => {
  const database = await setupDatabase(context);
  const version = quizItemVersion(quizItemFromMaterialBody(materialBody(), 0)!);
  const retryable = {
    materialId: 'toeic-1', itemIndex: 0, itemVersion: version,
    ...identity(20, 'A', '2026-09-07T11:00:00.000Z'),
  };
  const receipt = await recordQuizAnswer(database, retryable, '2026-09-07T11:00:00.000Z');
  await database.prepare('UPDATE study_content SET body_json = ? WHERE id = ?').bind(materialBody('A'), 'toeic-1').run();
  assert.deepEqual(await recordQuizAnswer(database, retryable, '2026-09-07T11:01:00.000Z'), receipt);

  await recordSavedQuizAnswer(database, {
    materialId: 'toeic-1', itemIndex: 0, itemHash: receipt.itemHash,
    ...identity(21, 'D', '2026-09-07T11:05:00.000Z'),
  }, '2026-09-07T11:05:00.000Z');
  await recordSavedQuizAnswer(database, {
    materialId: 'toeic-1', itemIndex: 0, itemHash: receipt.itemHash,
    ...identity(22, 'B', '2026-09-07T11:04:00.000Z'),
  }, '2026-09-07T11:05:00.000Z');

  const mistakes = await listQuizMistakes(database);
  assert.equal(mistakes.length, 1);
  assert.equal(mistakes[0].selectedLabel, 'D');
  assert.equal(mistakes[0].attempts, 2);
});
