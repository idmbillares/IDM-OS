-- Preserve integer inventory history while allowing up to three decimal places
-- for metres and kilograms. Monetary amounts remain whole minor units.
ALTER TABLE inventory_products
  ALTER COLUMN minimum_quantity TYPE numeric(18,3) USING minimum_quantity::numeric(18,3);
ALTER TABLE inventory_movements
  ALTER COLUMN quantity TYPE numeric(18,3) USING quantity::numeric(18,3),
  ALTER COLUMN previous_quantity TYPE numeric(18,3) USING previous_quantity::numeric(18,3),
  ALTER COLUMN next_quantity TYPE numeric(18,3) USING next_quantity::numeric(18,3);
ALTER TABLE inventory_products
  ADD COLUMN brand text,
  ADD COLUMN variant text,
  ADD COLUMN subcategory text,
  ADD COLUMN storage_location text,
  ADD COLUMN notes text;
CREATE TABLE inventory_product_photos (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  mime_type text NOT NULL CHECK (mime_type='image/png'),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 2097152),
  sha256 text NOT NULL CHECK (length(sha256)=64),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 3000),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 3000),
  created_at timestamptz NOT NULL,
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE(product_id,sha256),
  UNIQUE(id,product_id)
);
ALTER TABLE inventory_products ADD COLUMN photo_id text;
ALTER TABLE inventory_products ADD CONSTRAINT inventory_photo_ownership
  FOREIGN KEY(photo_id,id) REFERENCES inventory_product_photos(id,product_id) ON DELETE RESTRICT;
CREATE TRIGGER inventory_product_photos_immutable BEFORE UPDATE OR DELETE ON inventory_product_photos
  FOR EACH ROW EXECUTE FUNCTION idm_append_only();
ALTER TABLE inventory_product_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventory_product_photos FROM anon,authenticated;

CREATE FUNCTION idm_inventory_quantity_unit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE product_unit text;
BEGIN
  SELECT unit INTO product_unit FROM inventory_products WHERE id=NEW.product_id;
  IF product_unit NOT IN ('metro','kilogramo') AND NEW.quantity <> trunc(NEW.quantity) THEN
    RAISE EXCEPTION 'fractional quantities are allowed only for metre or kilogram products';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_quantity_unit_guard BEFORE INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION idm_inventory_quantity_unit_guard();
REVOKE EXECUTE ON FUNCTION idm_inventory_quantity_unit_guard() FROM PUBLIC,anon,authenticated;
