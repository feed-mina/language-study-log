CREATE TABLE `telegram_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`update_id` integer NOT NULL,
	`connected_at` text NOT NULL,
	`updated_at` text NOT NULL
);
