ALTER TABLE `study_plans` ADD `source_plan_id` text;
--> statement-breakpoint
ALTER TABLE `study_logs` ADD `source_type` text NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE `study_logs` ADD `source_id` text;
--> statement-breakpoint
ALTER TABLE `study_logs` ADD `source_label` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `study_logs` ADD `confused_items` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `study_cards` ADD `options_json` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
CREATE INDEX `idx_study_logs_source` ON `study_logs` (`source_type`, `source_id`);
--> statement-breakpoint
CREATE TABLE `study_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`target_score` integer NOT NULL,
	`exam_date` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `toeic_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`score` integer NOT NULL,
	`score_date` text NOT NULL,
	`score_type` text NOT NULL,
	`source` text NOT NULL DEFAULT '',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_toeic_scores_date` ON `toeic_scores` (`score_date`, `created_at`);
