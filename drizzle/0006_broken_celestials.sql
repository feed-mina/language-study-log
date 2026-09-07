CREATE TABLE `quiz_attempts` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`material_id` text NOT NULL,
	`material_date` text NOT NULL,
	`material_title` text NOT NULL,
	`item_index` integer NOT NULL,
	`item_hash` text NOT NULL,
	`item_json` text NOT NULL,
	`selected_label` text NOT NULL,
	`correct` integer NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`attempted_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_quiz_attempts_request` ON `quiz_attempts` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_quiz_attempts_item` ON `quiz_attempts` (`material_id`,`item_index`,`item_hash`,`attempted_at`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_quiz_attempts_time` ON `quiz_attempts` (`attempted_at`,`sequence`);
