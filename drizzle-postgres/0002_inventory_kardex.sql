-- First operational inventory ledger. Quantities are integer units; monetary
-- values remain integer minor units. Stock is derived only from this ledger.
CREATE TABLE inventory_products (
  id text PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  unit text NOT NULL,
  cost_minor bigint NOT NULL DEFAULT 0 CHECK (cost_minor >= 0),
  sale_price_minor bigint NOT NULL DEFAULT 0 CHECK (sale_price_minor >= 0),
  minimum_quantity bigint NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX inventory_products_category_active_idx ON inventory_products(category,is_active);
CREATE TABLE inventory_movements (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('OPENING_BALANCE','ENTRY','EXIT','POSITIVE_ADJUSTMENT','NEGATIVE_ADJUSTMENT','SALE','RETURN','PURCHASE')),
  quantity bigint NOT NULL CHECK (quantity <> 0),
  previous_quantity bigint NOT NULL CHECK (previous_quantity >= 0),
  next_quantity bigint NOT NULL CHECK (next_quantity >= 0),
  unit_cost_minor bigint NOT NULL CHECK (unit_cost_minor >= 0),
  reference text,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'MANUAL',
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX inventory_movements_product_date_idx ON inventory_movements(product_id,created_at DESC);
CREATE TRIGGER inventory_movements_immutable BEFORE UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION idm_append_only();
ALTER TABLE inventory_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventory_products,inventory_movements FROM anon,authenticated;
