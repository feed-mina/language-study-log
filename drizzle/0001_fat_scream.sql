CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_kind` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`status` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_automation_runs_scheduled` ON `automation_runs` (`scheduled_for`);--> statement-breakpoint
CREATE TABLE `delivery_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`channel` text NOT NULL,
	`recipient_hash` text NOT NULL,
	`status` text NOT NULL,
	`provider_id` text DEFAULT '' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_delivery_content_channel_recipient` ON `delivery_logs` (`content_id`,`channel`,`recipient_hash`);--> statement-breakpoint
CREATE INDEX `idx_delivery_content` ON `delivery_logs` (`content_id`);--> statement-breakpoint
CREATE TABLE `study_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text,
	`kind` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_study_assets_r2_key` ON `study_assets` (`r2_key`);--> statement-breakpoint
CREATE INDEX `idx_study_assets_content` ON `study_assets` (`content_id`);--> statement-breakpoint
CREATE TABLE `study_content` (
	`id` text PRIMARY KEY NOT NULL,
	`content_date` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body_json` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_study_content_date_kind` ON `study_content` (`content_date`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_study_content_date` ON `study_content` (`content_date`);