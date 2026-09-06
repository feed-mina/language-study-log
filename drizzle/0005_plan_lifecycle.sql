CREATE TABLE `study_plan_events` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`event_type` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`related_plan_id` text,
	`target_date` text,
	`idempotency_key` text,
	`result_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_study_plan_events_idempotency` ON `study_plan_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_study_plan_events_plan_created` ON `study_plan_events` (`plan_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `study_plans` ADD `status` text DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_plans` ADD `root_plan_id` text;--> statement-breakpoint
ALTER TABLE `study_plans` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_plans` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `study_plans` ADD `archive_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `study_plans`
SET `status` = CASE `completed`
	WHEN 1 THEN 'completed'
	WHEN 2 THEN 'rescheduled'
	ELSE 'planned'
END,
	`updated_at` = `created_at`;--> statement-breakpoint
WITH RECURSIVE `plan_roots`(`id`, `root_id`) AS (
	SELECT `id`, `id` FROM `study_plans` WHERE `source_plan_id` IS NULL
	UNION ALL
	SELECT `child`.`id`, `plan_roots`.`root_id`
	FROM `study_plans` AS `child`
	JOIN `plan_roots` ON `child`.`source_plan_id` = `plan_roots`.`id`
)
UPDATE `study_plans`
SET `root_plan_id` = COALESCE(
	(SELECT `root_id` FROM `plan_roots` WHERE `plan_roots`.`id` = `study_plans`.`id`),
	`id`
);--> statement-breakpoint
CREATE INDEX `idx_study_plans_status_date` ON `study_plans` (`status`,`plan_date`);
