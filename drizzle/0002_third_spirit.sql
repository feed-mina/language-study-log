CREATE TABLE `review_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`rating` integer NOT NULL,
	`reviewed_at` text NOT NULL,
	`previous_due` text NOT NULL,
	`next_due` text NOT NULL,
	`scheduled_days` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_review_logs_card_reviewed` ON `review_logs` (`card_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `study_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text,
	`language` text NOT NULL,
	`category` text NOT NULL,
	`prompt` text NOT NULL,
	`answer` text NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'generated' NOT NULL,
	`due` text NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`elapsed_days` integer DEFAULT 0 NOT NULL,
	`scheduled_days` integer DEFAULT 0 NOT NULL,
	`learning_steps` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`last_review` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_study_cards_content_prompt` ON `study_cards` (`content_id`,`prompt`);--> statement-breakpoint
CREATE INDEX `idx_study_cards_due` ON `study_cards` (`due`);--> statement-breakpoint
CREATE INDEX `idx_study_cards_language_due` ON `study_cards` (`language`,`due`);--> statement-breakpoint
PRAGMA optimize;
