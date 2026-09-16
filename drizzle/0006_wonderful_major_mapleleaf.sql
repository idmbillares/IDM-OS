CREATE TABLE `app_unlock_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_unlock_sessions_token_hash_uq` ON `app_unlock_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `app_unlock_sessions_user_active_idx` ON `app_unlock_sessions` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `app_unlock_sessions_expiry_idx` ON `app_unlock_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `user_pin_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`pin_hash` text NOT NULL,
	`salt` text NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "user_pin_credentials_failed_attempts_non_negative" CHECK("user_pin_credentials"."failed_attempts" >= 0)
);
