import assert from 'node:assert/strict';
import test from 'node:test';

import { isReviewRating, REVIEW_RATINGS, scheduleReview } from './review.ts';
import type { StudyCardRow } from './types.ts';

test('review ratings expose the four FSRS learning choices', () => {
  assert.deepEqual(REVIEW_RATINGS, ['again', 'hard', 'good', 'easy']);
  assert.equal(isReviewRating('good'), true);
  assert.equal(isReviewRating('manual'), false);
  assert.equal(isReviewRating(3), false);
});

test('scheduleReview moves a new card to a future FSRS review', () => {
  const now = new Date('2026-08-23T00:00:00.000Z');
  const row: StudyCardRow = {
    id: 'card-1',
    content_id: null,
    language: 'english',
    category: 'meeting',
    prompt: 'Could you clarify that point?',
    answer: '그 점을 명확히 설명해 주시겠어요?',
    explanation: '',
    source: 'test',
    due: now.toISOString(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const result = scheduleReview(row, 'good', now);
  assert.ok(result.card.due.getTime() > now.getTime());
  assert.equal(result.card.reps, 1);
  assert.equal(result.log.rating, 3);
});
