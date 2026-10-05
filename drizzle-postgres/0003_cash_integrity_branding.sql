-- Additive migration. No historical movements or audit records are rewritten.
-- Small immutable logos live beside their metadata, surviving serverless restarts.
-- An unset custom setting returns NULL; a guard must fail closed, not skip IF NOT.
CREATE OR REPLACE FUNCTION idm_migration_mode() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('idm.migration_mode', true) = 'on', false)
$$;
CREATE TABLE branding_asset_contents (
  asset_id text PRIMARY KEY REFERENCES branding_assets(id) ON DELETE RESTRICT,
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 524288)
);
ALTER TABLE branding_asset_contents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON branding_asset_contents FROM PUBLIC, anon, authenticated;
CREATE TRIGGER branding_asset_contents_immutable BEFORE UPDATE OR DELETE
  ON branding_asset_contents FOR EACH ROW EXECUTE FUNCTION idm_append_only();

CREATE FUNCTION idm_cash_posting_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item record; movement_count integer; total numeric; sign_factor integer;
BEGIN
  IF idm_migration_mode() THEN RETURN NEW; END IF;
  IF OLD.status = 'POSTED' AND NEW.status = 'VOIDED' AND NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'posted transaction source is immutable';
  END IF;
  IF OLD.status <> 'DRAFT' OR NEW.status <> 'POSTED' THEN RETURN NEW; END IF;
  IF NEW.created_by_user_id IS NULL THEN RAISE EXCEPTION 'posting requires an actor'; END IF;
  IF EXISTS (SELECT 1 FROM financial_movements WHERE transaction_id=NEW.id AND
    (created_by_user_id IS DISTINCT FROM NEW.created_by_user_id OR abs(amount_minor::numeric)>9007199254740991)) THEN
    RAISE EXCEPTION 'movement actor or integer range is invalid';
  END IF;
  SELECT count(*) INTO movement_count FROM financial_movements WHERE transaction_id=NEW.id;
  sign_factor := CASE WHEN NEW.reversal_of_transaction_id IS NULL THEN 1 ELSE -1 END;
  IF NEW.type IN ('INCOME','EXPENSE','ADJUSTMENT') AND movement_count <> 1 THEN
    RAISE EXCEPTION 'cash entries require exactly one movement';
  END IF;
  IF NEW.type='INCOME' AND EXISTS (SELECT 1 FROM financial_movements WHERE transaction_id=NEW.id AND amount_minor::numeric*sign_factor <= 0) OR
     NEW.type='EXPENSE' AND EXISTS (SELECT 1 FROM financial_movements WHERE transaction_id=NEW.id AND amount_minor::numeric*sign_factor >= 0) THEN
    RAISE EXCEPTION 'cash entry sign is invalid';
  END IF;
  IF NEW.reversal_of_transaction_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM financial_transactions WHERE id=NEW.reversal_of_transaction_id AND source='VOID_REVERSAL'
  ) THEN RAISE EXCEPTION 'reversals cannot be reversed'; END IF;
  -- Same ordering as the service. The ledger is checked after account locks.
  FOR item IN SELECT a.id FROM financial_accounts a WHERE EXISTS (
    SELECT 1 FROM financial_movements m WHERE m.transaction_id=NEW.id AND m.account_id=a.id
  ) ORDER BY a.id FOR UPDATE LOOP
    SELECT coalesce(sum(m.amount_minor),0) INTO total FROM financial_movements m
    JOIN financial_transactions t ON t.id=m.transaction_id
    WHERE m.account_id=item.id AND (t.status<>'DRAFT' OR t.id=NEW.id);
    IF total<0 OR total>9007199254740991 THEN RAISE EXCEPTION 'account balance outside allowed range'; END IF;
    IF NEW.source='OPENING_BALANCE' AND EXISTS (
      SELECT 1 FROM financial_movements m JOIN financial_transactions t ON t.id=m.transaction_id
      WHERE m.account_id=item.id AND t.source='OPENING_BALANCE' AND t.status='POSTED' AND t.id<>NEW.id
    ) THEN RAISE EXCEPTION 'opening balance already posted'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER financial_cash_posting_guard BEFORE UPDATE ON financial_transactions
  FOR EACH ROW EXECUTE FUNCTION idm_cash_posting_guard();
REVOKE EXECUTE ON FUNCTION idm_cash_posting_guard() FROM PUBLIC, anon, authenticated;
