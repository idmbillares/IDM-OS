ALTER TABLE `financial_transactions` ADD `category` text;--> statement-breakpoint
ALTER TABLE `financial_transactions` ADD `source` text DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
CREATE INDEX `financial_transactions_source_date_idx` ON `financial_transactions` (`source`,`occurred_at`);