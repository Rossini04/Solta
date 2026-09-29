-- Estrutura original: arquivos, pastas, grupos e documentos.
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

CREATE INDEX `idx_files_status_created_id` ON `files` (`status`,`created_at`,`id`);
CREATE TABLE `parts` (
	`file_id` text NOT NULL,
	`number` integer NOT NULL,
	`etag` text NOT NULL,
	`size` integer NOT NULL,
	PRIMARY KEY(`file_id`, `number`),
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `upload_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);

CREATE TABLE `cooldowns` (
	`ip` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`next_at` integer NOT NULL
);

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

CREATE INDEX `idx_documents_group_updated` ON `documents` (`group_id`,`updated_at`);
CREATE TABLE `folder_sessions` (
	`folder_id` text NOT NULL,
	`session` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`folder_id`, `session`)
);

CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`access` text NOT NULL,
	`group_id` text,
	`password_hash` text,
	`created_at` integer NOT NULL
);

CREATE INDEX `idx_folders_owner` ON `folders` (`owner_id`);
CREATE INDEX `idx_folders_group` ON `folders` (`group_id`);
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`invite` text NOT NULL,
	`created_at` integer NOT NULL
);

CREATE UNIQUE INDEX `groups_invite_unique` ON `groups` (`invite`);
CREATE TABLE `members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`)
);

CREATE INDEX `idx_members_user` ON `members` (`user_id`);
CREATE TABLE `presence` (
	`document_id` text NOT NULL,
	`peer_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`sharing` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`document_id`, `peer_id`)
);

CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text NOT NULL,
	`reporter` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL
);

CREATE INDEX `idx_reports_status_created` ON `reports` (`status`,`created_at`);
CREATE TABLE `signals` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` text NOT NULL,
	`sender` text NOT NULL,
	`receiver` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);

CREATE INDEX `idx_signals_document_receiver_seq` ON `signals` (`document_id`,`receiver`,`seq`);
ALTER TABLE `files` ADD `owner_id` text;
ALTER TABLE `files` ADD `owner_session` text;
ALTER TABLE `files` ADD `ip_hash` text;
ALTER TABLE `files` ADD `folder_id` text;