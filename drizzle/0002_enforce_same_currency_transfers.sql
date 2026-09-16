DROP TRIGGER `financial_transactions_validate_posting`;--> statement-breakpoint
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
			OR (
				SELECT COUNT(DISTINCT `financial_accounts`.`currency`)
				FROM `financial_movements`
				INNER JOIN `financial_accounts` ON `financial_accounts`.`id` = `financial_movements`.`account_id`
				WHERE `financial_movements`.`transaction_id` = NEW.`id`
			) <> 1
		)
		THEN RAISE(ABORT, 'transfers require two distinct, same-currency, compensating movements')
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
END;
