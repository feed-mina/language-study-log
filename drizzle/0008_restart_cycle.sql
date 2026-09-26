CREATE TABLE `study_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`curriculum_version` text NOT NULL,
	`start_step` integer DEFAULT 1 NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`daily_minutes` integer NOT NULL,
	`started_on` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_study_cycles_language_state` ON `study_cycles` (`language`,`state`);
--> statement-breakpoint
CREATE TABLE `study_track_settings` (
	`language` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`daily_minutes` integer NOT NULL,
	`curriculum_version` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `study_archive_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`snapshot_token` text NOT NULL,
	`backlog_count` integer NOT NULL,
	`replaced_today_count` integer NOT NULL,
	`total_minutes` integer NOT NULL,
	`reason` text NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_study_archive_batches_request` ON `study_archive_batches` (`request_id`);
--> statement-breakpoint
CREATE TABLE `study_archive_batch_items` (
	`batch_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`item_scope` text NOT NULL,
	PRIMARY KEY(`batch_id`,`plan_id`),
	FOREIGN KEY (`batch_id`) REFERENCES `study_archive_batches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`plan_id`) REFERENCES `study_plans`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `study_plans` ADD `cycle_id` text;
--> statement-breakpoint
ALTER TABLE `study_plans` ADD `archive_batch_id` text;
--> statement-breakpoint
CREATE INDEX `idx_study_plans_cycle` ON `study_plans` (`cycle_id`);
--> statement-breakpoint
CREATE INDEX `idx_study_plans_archive_batch` ON `study_plans` (`archive_batch_id`);
