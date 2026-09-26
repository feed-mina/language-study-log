ALTER TABLE `study_archive_batches` ADD `restored_at` text;
--> statement-breakpoint
ALTER TABLE `study_archive_batches` ADD `restore_request_id` text;
--> statement-breakpoint
ALTER TABLE `study_archive_batches` ADD `restore_result_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_study_archive_batches_restore_request` ON `study_archive_batches` (`restore_request_id`);
