import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const studyPlans = sqliteTable('study_plans', {
  id: text('id').primaryKey(),
  planDate: text('plan_date').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull().default(''),
  minutes: integer('minutes').notNull(),
  completed: integer('completed').notNull().default(0),
  sourcePlanId: text('source_plan_id'),
  status: text('status').notNull().default('planned'),
  rootPlanId: text('root_plan_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull().default(''),
  archivedAt: text('archived_at'),
  archiveReason: text('archive_reason').notNull().default(''),
}, (table) => [
  index('idx_study_plans_date').on(table.planDate),
  index('idx_study_plans_status_date').on(table.status, table.planDate),
]);

export const studyPlanEvents = sqliteTable('study_plan_events', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull(),
  eventType: text('event_type').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  relatedPlanId: text('related_plan_id'),
  targetDate: text('target_date'),
  idempotencyKey: text('idempotency_key'),
  resultJson: text('result_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('uq_study_plan_events_idempotency').on(table.idempotencyKey),
  index('idx_study_plan_events_plan_created').on(table.planId, table.createdAt),
]);

export const studyLogs = sqliteTable('study_logs', {
  id: text('id').primaryKey(),
  studyDate: text('study_date').notNull(),
  part: text('part').notNull(),
  title: text('title').notNull(),
  minutes: integer('minutes').notNull(),
  score: text('score').notNull().default(''),
  note: text('note').notNull().default(''),
  sourceType: text('source_type').notNull().default('legacy'),
  sourceId: text('source_id'),
  sourceLabel: text('source_label').notNull().default(''),
  confusedItems: text('confused_items').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_study_logs_date').on(table.studyDate)]);

export const studyContent = sqliteTable('study_content', {
  id: text('id').primaryKey(),
  contentDate: text('content_date').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  bodyJson: text('body_json').notNull(),
  model: text('model').notNull(),
  status: text('status').notNull().default('ready'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('uq_study_content_date_kind').on(table.contentDate, table.kind),
  index('idx_study_content_date').on(table.contentDate),
]);

export const studyAssets = sqliteTable('study_assets', {
  id: text('id').primaryKey(),
  contentId: text('content_id'),
  kind: text('kind').notNull(),
  r2Key: text('r2_key').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('uq_study_assets_r2_key').on(table.r2Key),
  index('idx_study_assets_content').on(table.contentId),
]);

export const deliveryLogs = sqliteTable('delivery_logs', {
  id: text('id').primaryKey(),
  contentId: text('content_id').notNull(),
  channel: text('channel').notNull(),
  recipientHash: text('recipient_hash').notNull(),
  status: text('status').notNull(),
  providerId: text('provider_id').notNull().default(''),
  error: text('error').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('uq_delivery_content_channel_recipient').on(table.contentId, table.channel, table.recipientHash),
  index('idx_delivery_content').on(table.contentId),
]);

export const automationRuns = sqliteTable('automation_runs', {
  id: text('id').primaryKey(),
  jobKind: text('job_kind').notNull(),
  scheduledFor: text('scheduled_for').notNull(),
  status: text('status').notNull(),
  detail: text('detail').notNull().default(''),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
}, (table) => [index('idx_automation_runs_scheduled').on(table.scheduledFor)]);

export const studyCards = sqliteTable('study_cards', {
  id: text('id').primaryKey(),
  contentId: text('content_id'),
  language: text('language').notNull(),
  category: text('category').notNull(),
  prompt: text('prompt').notNull(),
  answer: text('answer').notNull(),
  explanation: text('explanation').notNull().default(''),
  optionsJson: text('options_json').notNull().default('[]'),
  source: text('source').notNull().default('generated'),
  due: text('due').notNull(),
  stability: real('stability').notNull().default(0),
  difficulty: real('difficulty').notNull().default(0),
  elapsedDays: integer('elapsed_days').notNull().default(0),
  scheduledDays: integer('scheduled_days').notNull().default(0),
  learningSteps: integer('learning_steps').notNull().default(0),
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  state: integer('state').notNull().default(0),
  lastReview: text('last_review'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('uq_study_cards_content_prompt').on(table.contentId, table.prompt),
  index('idx_study_cards_due').on(table.due),
  index('idx_study_cards_language_due').on(table.language, table.due),
]);

export const reviewLogs = sqliteTable('review_logs', {
  id: text('id').primaryKey(),
  cardId: text('card_id').notNull(),
  rating: integer('rating').notNull(),
  reviewedAt: text('reviewed_at').notNull(),
  previousDue: text('previous_due').notNull(),
  nextDue: text('next_due').notNull(),
  scheduledDays: integer('scheduled_days').notNull(),
  stability: real('stability').notNull(),
  difficulty: real('difficulty').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_review_logs_card_reviewed').on(table.cardId, table.reviewedAt),
]);

export const telegramConnections = sqliteTable('telegram_connections', {
  id: text('id').primaryKey(),
  chatId: text('chat_id').notNull(),
  updateId: integer('update_id').notNull(),
  connectedAt: text('connected_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Schedule times are optional and additive; old plans remain time-unspecified.
export const studyPlanSlots = sqliteTable('study_plan_slots', {
  planId: text('plan_id').primaryKey().references(() => studyPlans.id, { onDelete: 'cascade' }),
  startMinute: integer('start_minute'),
});
export const studyScheduleSettings = sqliteTable('study_schedule_settings', {
  id: text('id').primaryKey(), dailyMinutes: integer('daily_minutes').notNull(),
});
export const reviewSessions = sqliteTable('review_sessions', {
  id: text('id').primaryKey(), sessionDate: text('session_date').notNull(), startMinute: integer('start_minute'),
  minutes: integer('minutes').notNull(), status: text('status').notNull().default('planned'), createdAt: text('created_at').notNull(),
}, table => [index('idx_review_sessions_date').on(table.sessionDate, table.status)]);
export const reviewSessionCards = sqliteTable('review_session_cards', {
  sessionId: text('session_id').notNull().references(() => reviewSessions.id), cardId: text('card_id').notNull().references(() => studyCards.id),
  reviewedAt: text('reviewed_at'), rating: text('rating'), active: integer('active').notNull().default(1),
}, table => [uniqueIndex('uq_active_review_card').on(table.cardId).where(sql`${table.active} = 1`), primaryKey({ columns: [table.sessionId, table.cardId] })]);
export const scheduleReceipts = sqliteTable('schedule_receipts', {
  requestId: text('request_id').primaryKey(), fingerprint: text('fingerprint').notNull(), resultJson: text('result_json').notNull(),
});
export const scheduledReviewReceipts = sqliteTable('scheduled_review_receipts', {
  requestId: text('request_id').primaryKey(), sessionId: text('session_id').notNull(), cardId: text('card_id').notNull(),
  rating: text('rating').notNull(), expectedVersion: text('expected_version').notNull(), resultJson: text('result_json').notNull(),
});

export const studyGoals = sqliteTable('study_goals', {
  id: text('id').primaryKey(),
  targetScore: integer('target_score').notNull(),
  examDate: text('exam_date').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const toeicScores = sqliteTable('toeic_scores', {
  id: text('id').primaryKey(),
  score: integer('score').notNull(),
  scoreDate: text('score_date').notNull(),
  scoreType: text('score_type').notNull(),
  source: text('source').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_toeic_scores_date').on(table.scoreDate, table.createdAt)]);

export const quizAttempts = sqliteTable('quiz_attempts', {
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  requestId: text('request_id').notNull(),
  materialId: text('material_id').notNull(),
  materialDate: text('material_date').notNull(),
  materialTitle: text('material_title').notNull(),
  itemIndex: integer('item_index').notNull(),
  itemHash: text('item_hash').notNull(),
  itemJson: text('item_json').notNull(),
  selectedLabel: text('selected_label').notNull(),
  correct: integer('correct').notNull(),
  resolved: integer('resolved').notNull().default(0),
  attemptedAt: text('attempted_at').notNull(),
}, (table) => [
  uniqueIndex('uq_quiz_attempts_request').on(table.requestId),
  index('idx_quiz_attempts_item').on(table.materialId, table.itemIndex, table.itemHash, table.attemptedAt, table.sequence),
  index('idx_quiz_attempts_time').on(table.attemptedAt, table.sequence),
]);
