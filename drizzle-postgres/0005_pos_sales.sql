-- Internal POS receipts. This is not a DIAN invoice or tax document.
CREATE TABLE pos_sales (
  id text PRIMARY KEY,
  sale_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','VOIDED')),
  customer_name text,
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  posted_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  voided_by_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  CHECK ((status='DRAFT' AND posted_at IS NULL AND voided_at IS NULL AND void_reason IS NULL AND voided_by_user_id IS NULL)
    OR (status='POSTED' AND posted_at IS NOT NULL AND voided_at IS NULL AND void_reason IS NULL AND voided_by_user_id IS NULL)
    OR (status='VOIDED' AND posted_at IS NOT NULL AND voided_at IS NOT NULL AND void_reason IS NOT NULL AND voided_by_user_id IS NOT NULL))
);
CREATE INDEX pos_sales_status_date_idx ON pos_sales(status,created_at DESC);

CREATE TABLE pos_sale_items (
  id text PRIMARY KEY,
  sale_id text NOT NULL REFERENCES pos_sales(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  sku_snapshot text NOT NULL,
  name_snapshot text NOT NULL,
  unit_snapshot text NOT NULL,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0 AND (unit_snapshot IN ('metro','kilogramo') OR quantity = trunc(quantity))),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
  line_total_minor bigint NOT NULL CHECK (line_total_minor >= 0),
  unit_cost_minor bigint NOT NULL CHECK (unit_cost_minor >= 0),
  CHECK (line_total_minor::numeric = round(unit_price_minor::numeric * quantity,0) - discount_minor::numeric),
  UNIQUE (sale_id,product_id)
);
CREATE INDEX pos_sale_items_product_idx ON pos_sale_items(product_id,sale_id);

CREATE TABLE pos_sale_payments (
  id text PRIMARY KEY,
  sale_id text NOT NULL REFERENCES pos_sales(id) ON DELETE RESTRICT,
  account_id text NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  financial_transaction_id text NOT NULL UNIQUE REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  created_at timestamptz NOT NULL,
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX pos_sale_payments_sale_idx ON pos_sale_payments(sale_id);

ALTER TABLE inventory_movements ADD COLUMN sale_id text REFERENCES pos_sales(id) ON DELETE RESTRICT;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_sale_origin CHECK (type <> 'SALE' OR sale_id IS NOT NULL);
CREATE INDEX inventory_movements_sale_idx ON inventory_movements(sale_id);
CREATE UNIQUE INDEX inventory_sale_movement_once_idx ON inventory_movements(sale_id,product_id,type)
  WHERE sale_id IS NOT NULL AND type IN ('SALE','RETURN');

CREATE FUNCTION idm_pos_item_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF idm_migration_mode() THEN RETURN NEW; END IF;
  IF (SELECT status FROM pos_sales WHERE id=NEW.sale_id FOR UPDATE) <> 'DRAFT' THEN
    RAISE EXCEPTION 'POS items can only be added to a draft sale';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pos_sale_item_insert_guard BEFORE INSERT ON pos_sale_items
  FOR EACH ROW EXECUTE FUNCTION idm_pos_item_insert_guard();

CREATE FUNCTION idm_pos_payment_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sale_total bigint; paid numeric; movement_count integer;
BEGIN
  IF idm_migration_mode() THEN RETURN NEW; END IF;
  SELECT total_minor INTO sale_total FROM pos_sales
    WHERE id=NEW.sale_id AND status='POSTED' FOR UPDATE;
  IF sale_total IS NULL THEN RAISE EXCEPTION 'payments require a posted POS sale'; END IF;
  SELECT count(*) INTO movement_count FROM financial_movements m
    JOIN financial_transactions t ON t.id=m.transaction_id
    WHERE t.id=NEW.financial_transaction_id AND t.status='POSTED'
      AND m.account_id=NEW.account_id AND m.amount_minor=NEW.amount_minor;
  IF movement_count <> 1 OR
    (SELECT count(*) FROM financial_movements WHERE transaction_id=NEW.financial_transaction_id) <> 1 THEN
    RAISE EXCEPTION 'POS payment does not match its posted cash movement';
  END IF;
  SELECT coalesce(sum(amount_minor),0) INTO paid FROM pos_sale_payments WHERE sale_id=NEW.sale_id;
  IF paid + NEW.amount_minor > sale_total THEN RAISE EXCEPTION 'POS payments exceed sale total'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pos_sale_payment_insert_guard BEFORE INSERT ON pos_sale_payments
  FOR EACH ROW EXECUTE FUNCTION idm_pos_payment_insert_guard();

CREATE FUNCTION idm_pos_sale_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE line_total numeric; physical_count integer; movement_count integer;
BEGIN
  IF idm_migration_mode() THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'posted POS sales are immutable'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'VOIDED' OR (OLD.status = 'POSTED' AND NEW.status <> 'VOIDED')
     OR (OLD.status = 'DRAFT' AND NEW.status NOT IN ('DRAFT','POSTED')) THEN
    RAISE EXCEPTION 'invalid POS sale status transition';
  END IF;
  IF OLD.status = 'POSTED' AND (
    NEW.id <> OLD.id OR NEW.sale_number <> OLD.sale_number OR
    NEW.customer_name IS DISTINCT FROM OLD.customer_name OR
    NEW.total_minor <> OLD.total_minor OR NEW.idempotency_key <> OLD.idempotency_key OR
    NEW.created_at <> OLD.created_at OR NEW.posted_at <> OLD.posted_at OR
    NEW.created_by_user_id <> OLD.created_by_user_id OR
    NEW.voided_at IS NULL OR NEW.void_reason IS NULL OR NEW.voided_by_user_id IS NULL
  ) THEN RAISE EXCEPTION 'posted POS sale may only be voided with trace'; END IF;
  IF OLD.status = 'DRAFT' AND NEW.status = 'POSTED' THEN
    SELECT sum(line_total_minor) INTO line_total FROM pos_sale_items WHERE sale_id=NEW.id;
    IF line_total IS NULL OR line_total <> NEW.total_minor THEN
      RAISE EXCEPTION 'POS sale lines do not match total';
    END IF;
    SELECT count(*) INTO physical_count FROM pos_sale_items i
      JOIN inventory_products p ON p.id=i.product_id
      WHERE i.sale_id=NEW.id AND p.category <> 'Servicios';
    SELECT count(*) INTO movement_count FROM inventory_movements
      WHERE sale_id=NEW.id AND type='SALE';
    IF physical_count <> movement_count THEN
      RAISE EXCEPTION 'POS sale stock movements do not match physical items';
    END IF;
  END IF;
  IF OLD.status='POSTED' AND NEW.status='VOIDED' THEN
    SELECT count(*) INTO physical_count FROM pos_sale_items i
      JOIN inventory_products p ON p.id=i.product_id
      WHERE i.sale_id=NEW.id AND p.category <> 'Servicios';
    SELECT count(*) INTO movement_count FROM inventory_movements
      WHERE sale_id=NEW.id AND type='RETURN';
    IF physical_count <> movement_count OR EXISTS (
      SELECT 1 FROM pos_sale_payments p
      JOIN financial_transactions original ON original.id=p.financial_transaction_id
      WHERE p.sale_id=NEW.id AND (original.status <> 'VOIDED' OR NOT EXISTS (
        SELECT 1 FROM financial_transactions reversal
        WHERE reversal.reversal_of_transaction_id=original.id AND reversal.status='POSTED'
      ))
    ) THEN RAISE EXCEPTION 'POS void requires stock and cash reversals'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pos_sale_guard BEFORE UPDATE OR DELETE ON pos_sales FOR EACH ROW EXECUTE FUNCTION idm_pos_sale_guard();
CREATE TRIGGER pos_sale_items_immutable BEFORE UPDATE OR DELETE ON pos_sale_items FOR EACH ROW EXECUTE FUNCTION idm_append_only();
CREATE TRIGGER pos_sale_payments_immutable BEFORE UPDATE OR DELETE ON pos_sale_payments FOR EACH ROW EXECUTE FUNCTION idm_append_only();

ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sale_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_sales,pos_sale_items,pos_sale_payments FROM anon,authenticated;
REVOKE EXECUTE ON FUNCTION idm_pos_sale_guard() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION idm_pos_item_insert_guard() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION idm_pos_payment_insert_guard() FROM PUBLIC,anon,authenticated;
