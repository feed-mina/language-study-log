import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Miniflare } from 'miniflare';

import { listDueCards, reviewPriority } from './review.ts';
import type { StudyCardRow, WorkerEnv } from './types.ts';

function row(id: string, difficulty: number, lapses: number, state: number, learningSteps: number): StudyCardRow {
  return { id, content_id: null, language: 'english', category: 'word', prompt: id, answer: id, explanation: '', options_json: '[]', source: 'test', due: '2026-09-01T00:00:00.000Z', stability: 0, difficulty, elapsed_days: 0, scheduled_days: 0, learning_steps: learningSteps, reps: 0, lapses, state, last_review: null, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z' };
}

async function env(context: TestContext) {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch(){ return new Response("ok") } }', compatibilityDate: '2026-05-22', d1Databases: ['DB'] }); context.after(() => mf.dispose());
  const DB = await mf.getD1Database('DB');
  await DB.prepare(`CREATE TABLE study_cards(id TEXT PRIMARY KEY,content_id TEXT,language TEXT,category TEXT,prompt TEXT,answer TEXT,explanation TEXT,options_json TEXT,source TEXT,due TEXT,stability REAL,difficulty REAL,elapsed_days INTEGER,scheduled_days INTEGER,learning_steps INTEGER,reps INTEGER,lapses INTEGER,state INTEGER,last_review TEXT,created_at TEXT,updated_at TEXT)`).run();
  for (const card of [row('normal-high-stage', 2, 0, 2, 3), row('low-stage', 2, 0, 0, 0), row('weak', 7, 1, 2, 3)]) {
    await DB.prepare(`INSERT INTO study_cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...Object.values(card)).run();
  }
  return { DB } as WorkerEnv;
}

test('복습 우선순위는 약한 단어를 먼저 두고 일반 카드는 낮은 단계부터 둔다', async context => {
  const cards = await listDueCards(await env(context), undefined, 20);
  assert.deepEqual(cards.map(card => card.id), ['weak', 'low-stage', 'normal-high-stage']);
  assert.equal(reviewPriority(cards[0]).label, '약한 단어 우선');
  assert.equal(reviewPriority(cards[1]).label, '낮은 단계 1');
});
