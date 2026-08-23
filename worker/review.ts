import { fsrs, Rating, type CardInput, type Grade } from 'ts-fsrs';

import type { StudyCardRow, WorkerEnv } from './types';

export const REVIEW_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ['10m'],
  relearning_steps: ['10m'],
});

function asGrade(value: ReviewRating): Grade {
  if (value === 'again') return Rating.Again;
  if (value === 'hard') return Rating.Hard;
  if (value === 'good') return Rating.Good;
  return Rating.Easy;
}

export function isReviewRating(value: unknown): value is ReviewRating {
  return typeof value === 'string' && REVIEW_RATINGS.includes(value as ReviewRating);
}

function cardInput(row: StudyCardRow): CardInput {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review,
  };
}

export function scheduleReview(row: StudyCardRow, rating: ReviewRating, reviewedAt = new Date()) {
  return scheduler.next(cardInput(row), reviewedAt, asGrade(rating));
}

export function publicStudyCard(row: StudyCardRow) {
  return {
    id: row.id,
    language: row.language,
    category: row.category,
    prompt: row.prompt,
    answer: row.answer,
    explanation: row.explanation,
    source: row.source,
    due: row.due,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReview: row.last_review,
  };
}

export async function listDueCards(env: WorkerEnv, language?: string, limit = 20): Promise<StudyCardRow[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  const now = new Date().toISOString();
  const statement = language
    ? env.DB.prepare('SELECT * FROM study_cards WHERE due <= ? AND language = ? ORDER BY due LIMIT ?').bind(now, language, safeLimit)
    : env.DB.prepare('SELECT * FROM study_cards WHERE due <= ? ORDER BY due LIMIT ?').bind(now, safeLimit);
  const result = await statement.all<StudyCardRow>();
  return result.results ?? [];
}

export async function reviewCard(
  env: WorkerEnv,
  cardId: string,
  rating: ReviewRating,
  reviewedAt = new Date(),
): Promise<StudyCardRow> {
  const row = await env.DB.prepare('SELECT * FROM study_cards WHERE id = ? LIMIT 1').bind(cardId).first<StudyCardRow>();
  if (!row) throw new Error('Study card not found');

  const result = scheduleReview(row, rating, reviewedAt);
  const updatedAt = reviewedAt.toISOString();
  const nextDue = result.card.due.toISOString();
  const update = await env.DB.prepare(`UPDATE study_cards SET
      due = ?, stability = ?, difficulty = ?, elapsed_days = ?, scheduled_days = ?, learning_steps = ?,
      reps = ?, lapses = ?, state = ?, last_review = ?, updated_at = ?
    WHERE id = ? AND updated_at = ?`)
    .bind(
      nextDue,
      result.card.stability,
      result.card.difficulty,
      result.card.elapsed_days,
      result.card.scheduled_days,
      result.card.learning_steps,
      result.card.reps,
      result.card.lapses,
      result.card.state,
      result.card.last_review?.toISOString() ?? null,
      updatedAt,
      cardId,
      row.updated_at,
    )
    .run();
  if ((update.meta.changes ?? 0) !== 1) throw new Error('Study card changed; retry the review');

  await env.DB.prepare(`INSERT INTO review_logs
    (id, card_id, rating, reviewed_at, previous_due, next_due, scheduled_days, stability, difficulty, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(),
      cardId,
      result.log.rating,
      updatedAt,
      row.due,
      nextDue,
      result.card.scheduled_days,
      result.card.stability,
      result.card.difficulty,
      updatedAt,
    )
    .run();

  const stored = await env.DB.prepare('SELECT * FROM study_cards WHERE id = ? LIMIT 1').bind(cardId).first<StudyCardRow>();
  if (!stored) throw new Error('Study card not found');
  return stored;
}
