CREATE TABLE `application_branding` (
	`id` text PRIMARY KEY NOT NULL,
	`app_icon_asset_id` text,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by_user_id` text NOT NULL,
	FOREIGN KEY (`app_icon_asset_id`) REFERENCES `branding_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "application_branding_singleton" CHECK("application_branding"."id" = 'default'),
	CONSTRAINT "application_branding_revision_non_negative" CHECK("application_branding"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE `branding_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`sha256` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` integer NOT NULL,
	`created_by_user_id` text NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "branding_assets_mime_type_allowed" CHECK("branding_assets"."mime_type" = 'image/png'),
	CONSTRAINT "branding_assets_byte_size_allowed" CHECK("branding_assets"."byte_size" > 0 AND "branding_assets"."byte_size" <= 524288),
	CONSTRAINT "branding_assets_dimensions_allowed" CHECK("branding_assets"."width" > 0 AND "branding_assets"."width" <= 512 AND "branding_assets"."height" > 0 AND "branding_assets"."height" <= 512),
	CONSTRAINT "branding_assets_sha256_length" CHECK(length("branding_assets"."sha256") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branding_assets_storage_key_uq` ON `branding_assets` (`storage_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `branding_assets_sha256_uq` ON `branding_assets` (`sha256`);--> statement-breakpoint
CREATE TRIGGER `branding_assets_prevent_update`
BEFORE UPDATE ON `branding_assets`
BEGIN
	SELECT RAISE(ABORT, 'branding assets are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `branding_assets_prevent_delete`
BEFORE DELETE ON `branding_assets`
BEGIN
	SELECT RAISE(ABORT, 'branding assets are immutable');
END;
