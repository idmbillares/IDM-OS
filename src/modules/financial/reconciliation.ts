/** Read-only reconciliation. Accounts have no persisted balance to drift. */
export const cashReconciliationSql = `
WITH components AS (
  SELECT a.id,
    coalesce(sum(m.amount_minor) FILTER (WHERE t.status<>'DRAFT'),0) ledger,
    coalesce(sum(m.amount_minor) FILTER (WHERE t.status<>'DRAFT' AND coalesce(o.source,t.source)='OPENING_BALANCE'),0) opening,
    coalesce(sum(m.amount_minor) FILTER (WHERE t.status<>'DRAFT' AND t.type='INCOME'),0) income,
    coalesce(sum(-m.amount_minor) FILTER (WHERE t.status<>'DRAFT' AND t.type='EXPENSE'),0) expense,
    coalesce(sum(m.amount_minor) FILTER (WHERE t.status<>'DRAFT' AND t.type='TRANSFER' AND m.amount_minor>0),0) transfer_in,
    coalesce(sum(-m.amount_minor) FILTER (WHERE t.status<>'DRAFT' AND t.type='TRANSFER' AND m.amount_minor<0),0) transfer_out,
    coalesce(sum(m.amount_minor) FILTER (WHERE t.status<>'DRAFT' AND t.type='ADJUSTMENT' AND coalesce(o.source,t.source)<>'OPENING_BALANCE'),0) adjustments
  FROM financial_accounts a LEFT JOIN financial_movements m ON m.account_id=a.id
  LEFT JOIN financial_transactions t ON t.id=m.transaction_id
  LEFT JOIN financial_transactions o ON o.id=t.reversal_of_transaction_id GROUP BY a.id
)
SELECT id,ledger::text, (opening+income-expense+transfer_in-transfer_out+adjustments)::text calculated,
  ledger = opening+income-expense+transfer_in-transfer_out+adjustments AS consistent,
  ledger BETWEEN 0 AND 9007199254740991 AS safe
FROM components ORDER BY id`;

export const cashIntegrityIssuesSql = `
SELECT t.id,'missing_movements_or_actor' issue FROM financial_transactions t
WHERE t.status<>'DRAFT' AND (t.created_by_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM financial_movements m WHERE m.transaction_id=t.id))
UNION ALL
SELECT t.id,'invalid_transfer' FROM financial_transactions t JOIN financial_movements m ON m.transaction_id=t.id
JOIN financial_accounts a ON a.id=m.account_id WHERE t.status<>'DRAFT' AND t.type='TRANSFER' GROUP BY t.id
HAVING count(*)<>2 OR sum(m.amount_minor)<>0 OR count(DISTINCT m.account_id)<>2 OR count(DISTINCT a.currency)<>1
UNION ALL
SELECT t.id,'uncompensated_void' FROM financial_transactions t WHERE t.status='VOIDED'
AND NOT EXISTS(SELECT 1 FROM financial_transactions r WHERE r.reversal_of_transaction_id=t.id AND r.status='POSTED')
UNION ALL
SELECT r.id,'invalid_reversal' FROM financial_transactions r WHERE r.status='POSTED' AND r.reversal_of_transaction_id IS NOT NULL AND EXISTS(
 SELECT 1 FROM financial_movements m WHERE m.transaction_id IN(r.id,r.reversal_of_transaction_id) GROUP BY m.account_id HAVING sum(m.amount_minor)<>0
)
UNION ALL
SELECT m.id,'movement_actor_mismatch' FROM financial_movements m JOIN financial_transactions t ON t.id=m.transaction_id
WHERE t.status<>'DRAFT' AND m.created_by_user_id IS DISTINCT FROM t.created_by_user_id
UNION ALL
SELECT m.account_id,'duplicate_opening_balance' FROM financial_movements m JOIN financial_transactions t ON t.id=m.transaction_id
WHERE t.source='OPENING_BALANCE' AND t.status='POSTED' GROUP BY m.account_id HAVING count(*)>1`;
