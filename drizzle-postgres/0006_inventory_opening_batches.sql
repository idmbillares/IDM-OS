CREATE TABLE inventory_opening_batches (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED')),
  reference text,
  notes text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  posted_at timestamptz,
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  posted_by_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  CHECK ((status='DRAFT' AND posted_at IS NULL AND posted_by_user_id IS NULL)
    OR (status='POSTED' AND posted_at IS NOT NULL AND posted_by_user_id IS NOT NULL))
);
CREATE INDEX inventory_opening_batches_status_date_idx ON inventory_opening_batches(status,created_at DESC);

CREATE TABLE inventory_opening_batch_items (
  id text PRIMARY KEY,
  batch_id text NOT NULL REFERENCES inventory_opening_batches(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  unit_cost_minor bigint NOT NULL CHECK (unit_cost_minor >= 0),
  sale_price_minor bigint NOT NULL CHECK (sale_price_minor >= 0),
  UNIQUE (batch_id,product_id)
);
CREATE INDEX inventory_opening_batch_items_product_idx ON inventory_opening_batch_items(product_id);
ALTER TABLE inventory_movements ADD COLUMN opening_batch_id text REFERENCES inventory_opening_batches(id) ON DELETE RESTRICT;
CREATE INDEX inventory_movements_opening_batch_idx ON inventory_movements(opening_batch_id);

CREATE FUNCTION idm_opening_batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF idm_migration_mode() THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'posted opening batches are immutable'; END IF;
  IF OLD.status='POSTED' OR NEW.status NOT IN ('DRAFT','POSTED') THEN
    RAISE EXCEPTION 'posted opening batches are immutable';
  END IF;
  IF OLD.status='DRAFT' AND NEW.status='POSTED' AND (
    NEW.id <> OLD.id OR NEW.reference IS DISTINCT FROM OLD.reference OR
    NEW.notes IS DISTINCT FROM OLD.notes OR NEW.created_at <> OLD.created_at OR
    NEW.created_by_user_id <> OLD.created_by_user_id OR
    NEW.posted_at IS NULL OR NEW.posted_by_user_id IS NULL
  ) THEN RAISE EXCEPTION 'opening batch confirmation may only set posting metadata'; END IF;
  IF OLD.status='DRAFT' AND NEW.status='POSTED' AND NOT EXISTS (
    SELECT 1 FROM inventory_opening_batch_items WHERE batch_id=NEW.id
  ) THEN RAISE EXCEPTION 'opening batch requires items'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_opening_batch_guard BEFORE UPDATE OR DELETE ON inventory_opening_batches
  FOR EACH ROW EXECUTE FUNCTION idm_opening_batch_guard();
CREATE FUNCTION idm_opening_batch_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text; parent_id text; previous_status text;
BEGIN
  IF idm_migration_mode() THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_OP='DELETE' THEN parent_id := OLD.batch_id; ELSE parent_id := NEW.batch_id; END IF;
  IF TG_OP='UPDATE' THEN
    SELECT status INTO previous_status FROM inventory_opening_batches
      WHERE id=OLD.batch_id FOR UPDATE;
    IF previous_status <> 'DRAFT' THEN RAISE EXCEPTION 'posted opening batch items are immutable'; END IF;
  END IF;
  SELECT status INTO parent_status FROM inventory_opening_batches
    WHERE id=parent_id FOR UPDATE;
  IF parent_status <> 'DRAFT' THEN RAISE EXCEPTION 'posted opening batch items are immutable'; END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER inventory_opening_batch_item_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_opening_batch_items
  FOR EACH ROW EXECUTE FUNCTION idm_opening_batch_item_guard();

ALTER TABLE inventory_opening_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_opening_batch_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventory_opening_batches,inventory_opening_batch_items FROM anon,authenticated;
REVOKE EXECUTE ON FUNCTION idm_opening_batch_guard() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION idm_opening_batch_item_guard() FROM PUBLIC,anon,authenticated;
