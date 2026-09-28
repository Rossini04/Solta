CREATE TABLE `cooldowns` (
	`ip` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`next_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_documents_group_updated` ON `documents` (`group_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `folder_sessions` (
	`folder_id` text NOT NULL,
	`session` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`folder_id`, `session`)
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`access` text NOT NULL,
	`group_id` text,
	`password_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_folders_owner` ON `folders` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_folders_group` ON `folders` (`group_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`invite` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_invite_unique` ON `groups` (`invite`);--> statement-breakpoint
CREATE TABLE `members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_members_user` ON `members` (`user_id`);--> statement-breakpoint
CREATE TABLE `presence` (
	`document_id` text NOT NULL,
	`peer_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`sharing` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`document_id`, `peer_id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text NOT NULL,
	`reporter` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reports_status_created` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `signals` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` text NOT NULL,
	`sender` text NOT NULL,
	`receiver` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_signals_document_receiver_seq` ON `signals` (`document_id`,`receiver`,`seq`);--> statement-breakpoint
ALTER TABLE `files` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `files` ADD `owner_session` text;--> statement-breakpoint
ALTER TABLE `files` ADD `ip_hash` text;--> statement-breakpoint
ALTER TABLE `files` ADD `folder_id` text;