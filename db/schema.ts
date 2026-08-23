import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const studyPlans = sqliteTable('study_plans', {
  id: text('id').primaryKey(),
  planDate: text('plan_date').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull().default(''),
  minutes: integer('minutes').notNull(),
  completed: integer('completed').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_study_plans_date').on(table.planDate)]);

export const studyLogs = sqliteTable('study_logs', {
  id: text('id').primaryKey(),
  studyDate: text('study_date').notNull(),
  part: text('part').notNull(),
  title: text('title').notNull(),
  minutes: integer('minutes').notNull(),
  score: text('score').notNull().default(''),
  note: text('note').notNull().default(''),
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
