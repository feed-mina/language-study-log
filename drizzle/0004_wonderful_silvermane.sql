CREATE TABLE `quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`material_id` text NOT NULL,
	`item_index` integer NOT NULL,
	`selected_label` text NOT NULL,
	`correct_label` text NOT NULL,
	`prompt` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_quiz_attempts_material` ON `quiz_attempts` (`material_id`,`item_index`);--> statement-breakpoint
