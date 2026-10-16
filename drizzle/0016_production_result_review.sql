ALTER TABLE stock_movements DROP CONSTRAINT stock_movement_nonzero;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movement_nonzero
  CHECK (quantity <> 0 OR action = 'production_review');

CREATE OR REPLACE FUNCTION kybo_validate_movement_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin_kind text; origin_transfer uuid;
BEGIN
  SELECT kind,transfer_id INTO origin_kind,origin_transfer FROM stock_documents WHERE id=NEW.document_id AND branch_id=NEW.branch_id;
  IF NOT (
    (origin_kind='receipt' AND NEW.action='receipt') OR
    (origin_kind='adjustment' AND NEW.action IN ('opening','count','waste')) OR
    (origin_kind='sale' AND NEW.action IN ('sale_consume','direct_dispatch','waste')) OR
    (origin_kind='production' AND NEW.action IN ('production','waste','production_review')) OR
    (origin_kind='transfer' AND NEW.action='transfer') OR
    (origin_kind='internal_use' AND NEW.action='internal_use') OR
    (origin_kind='return' AND NEW.action='return')
  ) THEN RAISE EXCEPTION 'Movement action does not match its document'; END IF;
  IF NEW.action='production_review' AND (NEW.quantity<>0 OR NOT EXISTS (
    SELECT 1 FROM stock_documents d JOIN production_orders p ON p.id=d.production_order_id
    JOIN stock_operations o ON o.id=NEW.operation_id
    WHERE d.id=NEW.document_id AND p.output_item_id=NEW.item_id AND p.location_id=NEW.location_id
      AND p.branch_id=NEW.branch_id AND o.branch_id=NEW.branch_id AND o.action='production-review'
  )) THEN RAISE EXCEPTION 'Invalid production valuation correction'; END IF;
  IF origin_kind='transfer' AND NOT EXISTS(SELECT 1 FROM stock_transfers WHERE id=origin_transfer AND NEW.branch_id IN (origin_branch_id,destination_branch_id)) THEN
    RAISE EXCEPTION 'Transfer document belongs to another branch';
  END IF;
  RETURN NEW;
END;
$$;
