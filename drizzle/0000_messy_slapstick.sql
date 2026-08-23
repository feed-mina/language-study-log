CREATE TABLE `study_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`study_date` text NOT NULL,
	`part` text NOT NULL,
	`title` text NOT NULL,
	`minutes` integer NOT NULL,
	`score` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_study_logs_date` ON `study_logs` (`study_date`);--> statement-breakpoint
CREATE TABLE `study_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_date` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`minutes` integer NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_study_plans_date` ON `study_plans` (`plan_date`);