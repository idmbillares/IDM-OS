PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_financial_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`occurred_at` integer NOT NULL,
	`reference` text,
	`description` text,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by_user_id` text,
	`updated_by_user_id` text,
	`posted_at` integer,
	`voided_at` integer,
	`voided_by_user_id` text,
	`void_reason` text,
	`reversal_of_transaction_id` text,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`voided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reversal_of_transaction_id`) REFERENCES `financial_transactions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "financial_transactions_type_allowed" CHECK("__new_financial_transactions"."type" IN ('SALE', 'COLLECTION', 'INCOME', 'EXPENSE', 'PURCHASE', 'PAYMENT', 'TRANSFER', 'ADJUSTMENT')),
	CONSTRAINT "financial_transactions_status_allowed" CHECK("__new_financial_transactions"."status" IN ('DRAFT', 'POSTED', 'VOIDED')),
	CONSTRAINT "financial_transactions_lifecycle_metadata" CHECK((
        ("__new_financial_transactions"."status" = 'DRAFT' AND "__new_financial_transactions"."posted_at" IS NULL AND "__new_financial_transactions"."voided_at" IS NULL AND "__new_financial_transactions"."voided_by_user_id" IS NULL AND "__new_financial_transactions"."void_reason" IS NULL)
        OR
        ("__new_financial_transactions"."status" = 'POSTED' AND "__new_financial_transactions"."posted_at" IS NOT NULL AND "__new_financial_transactions"."voided_at" IS NULL AND "__new_financial_transactions"."voided_by_user_id" IS NULL AND "__new_financial_transactions"."void_reason" IS NULL)
        OR
        ("__new_financial_transactions"."status" = 'VOIDED' AND "__new_financial_transactions"."posted_at" IS NOT NULL AND "__new_financial_transactions"."voided_at" IS NOT NULL AND "__new_financial_transactions"."voided_by_user_id" IS NOT NULL AND "__new_financial_transactions"."void_reason" IS NOT NULL)
      )),
	CONSTRAINT "financial_transactions_reversal_not_self" CHECK("__new_financial_transactions"."reversal_of_transaction_id" IS NULL OR "__new_financial_transactions"."reversal_of_transaction_id" <> "__new_financial_transactions"."id")
);
--> statement-breakpoint
INSERT INTO `__new_financial_transactions`("id", "type", "status", "occurred_at", "reference", "description", "idempotency_key", "created_at", "updated_at", "created_by_user_id", "updated_by_user_id", "posted_at", "voided_at", "voided_by_user_id", "void_reason", "reversal_of_transaction_id") SELECT "id", "type", "status", "occurred_at", "reference", "description", "idempotency_key", "created_at", "updated_at", "created_by_user_id", "updated_by_user_id", "posted_at", "voided_at", "voided_by_user_id", "void_reason", NULL FROM `financial_transactions`;--> statement-breakpoint
DROP TABLE `financial_transactions`;--> statement-breakpoint
ALTER TABLE `__new_financial_transactions` RENAME TO `financial_transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `financial_transactions_idempotency_uq` ON `financial_transactions` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `financial_transactions_reversal_of_uq` ON `financial_transactions` (`reversal_of_transaction_id`);--> statement-breakpoint
CREATE INDEX `financial_transactions_status_date_idx` ON `financial_transactions` (`status`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `financial_transactions_type_date_idx` ON `financial_transactions` (`type`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `__new_financial_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`currency` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by_user_id` text,
	`updated_by_user_id` text,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "financial_accounts_kind_allowed" CHECK("__new_financial_accounts"."kind" IN ('CASH', 'PETTY_CASH', 'BANK', 'OTHER')),
	CONSTRAINT "financial_accounts_currency_iso_code" CHECK("__new_financial_accounts"."currency" GLOB '[A-Z][A-Z][A-Z]')
);
--> statement-breakpoint
INSERT INTO `__new_financial_accounts`("id", "name", "kind", "currency", "is_active", "archived_at", "created_at", "updated_at", "created_by_user_id", "updated_by_user_id") SELECT "id", "name", "kind", "currency", "is_active", "archived_at", "created_at", "updated_at", "created_by_user_id", "updated_by_user_id" FROM `financial_accounts`;--> statement-breakpoint
DROP TABLE `financial_accounts`;--> statement-breakpoint
ALTER TABLE `__new_financial_accounts` RENAME TO `financial_accounts`;--> statement-breakpoint
CREATE INDEX `financial_accounts_active_idx` ON `financial_accounts` (`is_active`);--> statement-breakpoint
CREATE INDEX `financial_accounts_kind_idx` ON `financial_accounts` (`kind`);--> statement-breakpoint
CREATE TABLE `__new_financial_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`created_at` integer NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`transaction_id`) REFERENCES `financial_transactions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_id`) REFERENCES `financial_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "financial_movements_amount_non_zero" CHECK("__new_financial_movements"."amount_minor" <> 0),
	CONSTRAINT "financial_movements_amount_integer" CHECK(typeof("__new_financial_movements"."amount_minor") = 'integer')
);
--> statement-breakpoint
INSERT INTO `__new_financial_movements`("id", "transaction_id", "account_id", "amount_minor", "created_at", "created_by_user_id") SELECT "id", "transaction_id", "account_id", "amount_minor", "created_at", "created_by_user_id" FROM `financial_movements`;--> statement-breakpoint
DROP TABLE `financial_movements`;--> statement-breakpoint
ALTER TABLE `__new_financial_movements` RENAME TO `financial_movements`;--> statement-breakpoint
CREATE INDEX `financial_movements_account_transaction_idx` ON `financial_movements` (`account_id`,`transaction_id`);--> statement-breakpoint
CREATE INDEX `financial_movements_transaction_idx` ON `financial_movements` (`transaction_id`);--> statement-breakpoint
-- SQLite triggers deliberately protect the ledger rules that table checks cannot express.
CREATE TRIGGER `audit_logs_prevent_update`
BEFORE UPDATE ON `audit_logs`
BEGIN
	SELECT RAISE(ABORT, 'audit logs are append-only');
END;--> statement-breakpoint
CREATE TRIGGER `audit_logs_prevent_delete`
BEFORE DELETE ON `audit_logs`
BEGIN
	SELECT RAISE(ABORT, 'audit logs are append-only');
END;--> statement-breakpoint
CREATE TRIGGER `financial_movements_require_draft_transaction_on_insert`
BEFORE INSERT ON `financial_movements`
WHEN COALESCE((SELECT `status` FROM `financial_transactions` WHERE `id` = NEW.`transaction_id`), '') <> 'DRAFT'
BEGIN
	SELECT RAISE(ABORT, 'financial movements can only be added to a draft transaction');
END;--> statement-breakpoint
CREATE TRIGGER `financial_movements_prevent_mutation_after_posting`
BEFORE UPDATE ON `financial_movements`
WHEN COALESCE((SELECT `status` FROM `financial_transactions` WHERE `id` = OLD.`transaction_id`), '') <> 'DRAFT'
	OR COALESCE((SELECT `status` FROM `financial_transactions` WHERE `id` = NEW.`transaction_id`), '') <> 'DRAFT'
BEGIN
	SELECT RAISE(ABORT, 'posted financial movements are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `financial_movements_prevent_delete_after_posting`
BEFORE DELETE ON `financial_movements`
WHEN COALESCE((SELECT `status` FROM `financial_transactions` WHERE `id` = OLD.`transaction_id`), '') <> 'DRAFT'
BEGIN
	SELECT RAISE(ABORT, 'posted financial movements are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `financial_transactions_require_draft_on_insert`
BEFORE INSERT ON `financial_transactions`
WHEN NEW.`status` <> 'DRAFT'
BEGIN
	SELECT RAISE(ABORT, 'financial transactions must start as drafts');
END;--> statement-breakpoint
CREATE TRIGGER `financial_transactions_validate_lifecycle`
BEFORE UPDATE OF `status` ON `financial_transactions`
WHEN NOT (
	(OLD.`status` = 'DRAFT' AND NEW.`status` IN ('DRAFT', 'POSTED'))
	OR (OLD.`status` = 'POSTED' AND NEW.`status` IN ('POSTED', 'VOIDED'))
	OR (OLD.`status` = 'VOIDED' AND NEW.`status` = 'VOIDED')
)
BEGIN
	SELECT RAISE(ABORT, 'invalid financial transaction status transition');
END;--> statement-breakpoint
CREATE TRIGGER `financial_transactions_validate_posting`
BEFORE UPDATE OF `status` ON `financial_transactions`
WHEN OLD.`status` = 'DRAFT' AND NEW.`status` = 'POSTED'
BEGIN
	SELECT CASE
		WHEN NOT EXISTS (
			SELECT 1 FROM `financial_movements` WHERE `transaction_id` = NEW.`id`
		)
		THEN RAISE(ABORT, 'posted financial transactions require movements')
	END;
	SELECT CASE
		WHEN NEW.`type` = 'TRANSFER' AND (
			(SELECT COUNT(*) FROM `financial_movements` WHERE `transaction_id` = NEW.`id`) <> 2
			OR (SELECT COALESCE(SUM(`amount_minor`), 0) FROM `financial_movements` WHERE `transaction_id` = NEW.`id`) <> 0
			OR (SELECT COUNT(DISTINCT `account_id`) FROM `financial_movements` WHERE `transaction_id` = NEW.`id`) <> 2
		)
		THEN RAISE(ABORT, 'transfers require two distinct, compensating movements')
	END;
	SELECT CASE
		WHEN NEW.`reversal_of_transaction_id` IS NOT NULL AND NOT EXISTS (
			SELECT 1
			FROM `financial_transactions`
			WHERE `id` = NEW.`reversal_of_transaction_id` AND `status` = 'POSTED'
		)
		THEN RAISE(ABORT, 'a reversal must compensate a posted transaction')
	END;
	SELECT CASE
		WHEN NEW.`reversal_of_transaction_id` IS NOT NULL AND EXISTS (
			SELECT 1
			FROM (
				SELECT `account_id`, SUM(`amount_minor`) AS `net_amount_minor`
				FROM `financial_movements`
				WHERE `transaction_id` IN (NEW.`id`, NEW.`reversal_of_transaction_id`)
				GROUP BY `account_id`
			)
			WHERE `net_amount_minor` <> 0
		)
		THEN RAISE(ABORT, 'a reversal must exactly compensate every affected account')
	END;
END;--> statement-breakpoint
CREATE TRIGGER `financial_transactions_require_compensation_before_voiding`
BEFORE UPDATE OF `status` ON `financial_transactions`
WHEN OLD.`status` = 'POSTED' AND NEW.`status` = 'VOIDED'
BEGIN
	SELECT CASE
		WHEN NOT EXISTS (
			SELECT 1
			FROM `financial_transactions`
			WHERE `reversal_of_transaction_id` = OLD.`id` AND `status` = 'POSTED'
		)
		THEN RAISE(ABORT, 'voiding requires a posted compensating transaction')
	END;
	SELECT CASE
		WHEN OLD.`reversal_of_transaction_id` IS NOT NULL AND EXISTS (
			SELECT 1
			FROM `financial_transactions`
			WHERE `id` = OLD.`reversal_of_transaction_id` AND `status` = 'VOIDED'
		)
		THEN RAISE(ABORT, 'a compensation for a voided transaction cannot be voided')
	END;
END;--> statement-breakpoint
CREATE TRIGGER `financial_transactions_protect_posted_fields`
BEFORE UPDATE ON `financial_transactions`
WHEN OLD.`status` IN ('POSTED', 'VOIDED') AND NOT (
	OLD.`status` = 'POSTED'
	AND NEW.`status` = 'VOIDED'
	AND NEW.`id` IS OLD.`id`
	AND NEW.`type` IS OLD.`type`
	AND NEW.`occurred_at` IS OLD.`occurred_at`
	AND NEW.`reference` IS OLD.`reference`
	AND NEW.`description` IS OLD.`description`
	AND NEW.`idempotency_key` IS OLD.`idempotency_key`
	AND NEW.`created_at` IS OLD.`created_at`
	AND NEW.`created_by_user_id` IS OLD.`created_by_user_id`
	AND NEW.`posted_at` IS OLD.`posted_at`
	AND NEW.`reversal_of_transaction_id` IS OLD.`reversal_of_transaction_id`
)
BEGIN
	SELECT RAISE(ABORT, 'posted financial transactions are immutable except for a traced void');
END;--> statement-breakpoint
CREATE TRIGGER `financial_transactions_prevent_delete_after_posting`
BEFORE DELETE ON `financial_transactions`
WHEN OLD.`status` <> 'DRAFT'
BEGIN
	SELECT RAISE(ABORT, 'posted financial transactions cannot be deleted');
END;
