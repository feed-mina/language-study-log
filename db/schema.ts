import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
