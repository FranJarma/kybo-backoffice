DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM data_model_state WHERE id=1 AND status='transitioning')
    OR (SELECT count(*) FROM branches)<>1 OR (SELECT count(*) FROM locations)<>1 THEN
    RAISE EXCEPTION 'Explicit transition mapping must be applied before finalization';
  END IF;
  IF EXISTS (
    SELECT 1 FROM stock_balances b FULL JOIN inventory_valuations v ON v.item_id=b.item_id
    WHERE b.physical_quantity IS DISTINCT FROM v.quantity OR b.stock_value IS DISTINCT FROM v.value
  ) OR EXISTS (
    SELECT 1 FROM stock_balances b FULL JOIN location_stock_balances s ON s.item_id=b.item_id
    WHERE b.physical_quantity IS DISTINCT FROM s.quantity OR s.reserved<>0
  ) OR EXISTS (
    SELECT 1 FROM inventory_lots l FULL JOIN lot_location_balances b ON b.lot_id=l.id
    WHERE l.remaining_quantity IS DISTINCT FROM b.quantity OR b.reserved<>0 OR l.blocked IS DISTINCT FROM b.blocked
  ) OR EXISTS (
    SELECT 1 FROM stock_balances b FULL JOIN stock_transition_baselines s ON s.item_id=b.item_id
    WHERE b.physical_quantity IS DISTINCT FROM s.quantity OR b.stock_value IS DISTINCT FROM s.value
  ) OR EXISTS (
    SELECT 1 FROM inventory_lots l FULL JOIN lot_transition_baselines b ON b.lot_id=l.id
    WHERE l.remaining_quantity IS DISTINCT FROM b.quantity
  ) THEN RAISE EXCEPTION 'Transition reconciliation failed'; END IF;
END;
$$;

--> statement-breakpoint
ALTER TABLE "preparation_routes" ADD CONSTRAINT "preparation_routes_branch_id_product_id_pk" PRIMARY KEY("branch_id","product_id");
--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "code" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "class" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "purchasable" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "recipe_usable" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "dining_tables" ALTER COLUMN "branch_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "branch_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sale_orders" ALTER COLUMN "branch_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sale_lines" ALTER COLUMN "branch_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "preparation_stations" ALTER COLUMN "branch_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "preparation_tasks" ALTER COLUMN "branch_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "preparation_routes" ALTER COLUMN "branch_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_receipts" ALTER COLUMN "branch_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "production_batches" ALTER COLUMN "branch_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "preparation_stations" ALTER COLUMN "consumption_location_id" SET NOT NULL;
--> statement-breakpoint
-- BEGIN INVARIANTS
-- Draft. Appended NOT NULL constraints are generated separately until review.
-- The transition runner verifies balances before enabling these protections.
CREATE FUNCTION kybo_immutable_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Immutable history: append a compensating event instead';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION kybo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER stock_documents_immutable BEFORE UPDATE OR DELETE ON stock_documents FOR EACH ROW EXECUTE FUNCTION kybo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER fulfillment_versions_immutable BEFORE UPDATE OR DELETE ON product_fulfillment_versions FOR EACH ROW EXECUTE FUNCTION kybo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER stock_baselines_immutable BEFORE INSERT OR UPDATE OR DELETE ON stock_transition_baselines FOR EACH ROW EXECUTE FUNCTION kybo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER lot_baselines_immutable BEFORE INSERT OR UPDATE OR DELETE ON lot_transition_baselines FOR EACH ROW EXECUTE FUNCTION kybo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER legacy_stock_frozen BEFORE INSERT OR UPDATE OR DELETE ON stock_balances FOR EACH ROW EXECUTE FUNCTION kybo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER legacy_movements_frozen BEFORE INSERT OR UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION kybo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER fulfillment_events_immutable BEFORE UPDATE OR DELETE ON fulfillment_events FOR EACH ROW EXECUTE FUNCTION kybo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER resolution_events_immutable BEFORE UPDATE OR DELETE ON stock_resolution_events FOR EACH ROW EXECUTE FUNCTION kybo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER transfer_resolutions_immutable BEFORE UPDATE OR DELETE ON transfer_resolutions FOR EACH ROW EXECUTE FUNCTION kybo_immutable_history();
--> statement-breakpoint
CREATE TRIGGER block_events_immutable BEFORE UPDATE OR DELETE ON stock_block_events FOR EACH ROW EXECUTE FUNCTION kybo_immutable_history();
--> statement-breakpoint
CREATE FUNCTION kybo_validate_movement_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin_kind text; origin_transfer uuid;
BEGIN
  SELECT kind,transfer_id INTO origin_kind,origin_transfer FROM stock_documents WHERE id=NEW.document_id AND branch_id=NEW.branch_id;
  IF NOT (
    (origin_kind='receipt' AND NEW.action='receipt') OR
    (origin_kind='adjustment' AND NEW.action IN ('opening','count','waste')) OR
    (origin_kind='sale' AND NEW.action IN ('sale_consume','direct_dispatch','waste')) OR
    (origin_kind='production' AND NEW.action IN ('production','waste')) OR
    (origin_kind='transfer' AND NEW.action='transfer') OR
    (origin_kind='internal_use' AND NEW.action='internal_use') OR
    (origin_kind='return' AND NEW.action='return')
  ) THEN RAISE EXCEPTION 'Movement action does not match its document'; END IF;
  IF origin_kind='transfer' AND NOT EXISTS(SELECT 1 FROM stock_transfers WHERE id=origin_transfer AND NEW.branch_id IN (origin_branch_id,destination_branch_id)) THEN
    RAISE EXCEPTION 'Transfer document belongs to another branch';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_movement_origin BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION kybo_validate_movement_origin();
