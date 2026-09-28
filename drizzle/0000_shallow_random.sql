CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`mime` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`upload_id` text NOT NULL,
	`token_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_files_status_created_id` ON `files` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `parts` (
	`file_id` text NOT NULL,
	`number` integer NOT NULL,
	`etag` text NOT NULL,
	`size` integer NOT NULL,
	PRIMARY KEY(`file_id`, `number`),
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `upload_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
