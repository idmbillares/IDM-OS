ALTER TABLE `financial_accounts` ADD `description` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_accounts_name_normalized_uq`
ON `financial_accounts` (lower(trim(`name`)));
