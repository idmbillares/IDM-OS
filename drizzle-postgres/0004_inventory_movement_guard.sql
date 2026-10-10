-- Lock each product before accepting a ledger row, including direct SQL writes.
-- This adds database enforcement without rewriting existing product or cash data.
CREATE FUNCTION idm_inventory_movement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_quantity numeric;
BEGIN
  IF idm_migration_mode() THEN RETURN NEW; END IF;
  PERFORM 1 FROM inventory_products WHERE id = NEW.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory product does not exist'; END IF;
  SELECT coalesce(sum(quantity), 0) INTO current_quantity
    FROM inventory_movements WHERE product_id = NEW.product_id;
  IF NEW.previous_quantity <> current_quantity
     OR NEW.next_quantity <> current_quantity + NEW.quantity THEN
    RAISE EXCEPTION 'inventory movement does not match current stock';
  END IF;
  IF (NEW.type IN ('OPENING_BALANCE','ENTRY','POSITIVE_ADJUSTMENT','RETURN','PURCHASE') AND NEW.quantity <= 0)
     OR (NEW.type IN ('EXIT','NEGATIVE_ADJUSTMENT','SALE') AND NEW.quantity >= 0) THEN
    RAISE EXCEPTION 'inventory movement has invalid direction';
  END IF;
  IF NEW.type = 'OPENING_BALANCE' AND EXISTS (
    SELECT 1 FROM inventory_movements WHERE product_id = NEW.product_id
  ) THEN
    RAISE EXCEPTION 'inventory opening balance already exists';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_movement_guard BEFORE INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION idm_inventory_movement_guard();
REVOKE EXECUTE ON FUNCTION idm_inventory_movement_guard() FROM PUBLIC, anon, authenticated;
