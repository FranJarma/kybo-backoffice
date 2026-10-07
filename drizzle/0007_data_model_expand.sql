-- Draft: execute only through the reviewed data-model transition.
ALTER TABLE "ingredients" RENAME TO "items";
--> statement-breakpoint
ALTER INDEX "ingredients_pkey" RENAME TO "items_pkey";
--> statement-breakpoint
ALTER TABLE "items" RENAME CONSTRAINT "ingredient_base_unit" TO "item_base_unit";
--> statement-breakpoint
ALTER TABLE "items" RENAME CONSTRAINT "ingredient_cost_nonnegative" TO "item_cost_nonnegative";
--> statement-breakpoint
ALTER TABLE "purchase_presentations" RENAME COLUMN "ingredient_id" TO "item_id";
--> statement-breakpoint
ALTER INDEX "presentation_ingredient" RENAME TO "presentation_item";
--> statement-breakpoint
ALTER TABLE "purchase_presentations" RENAME CONSTRAINT "purchase_presentations_ingredient_id_ingredients_id_fk" TO "purchase_presentations_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_lots" RENAME COLUMN "ingredient_id" TO "item_id";
--> statement-breakpoint
ALTER INDEX "lot_ingredient_expiry" RENAME TO "lot_item_expiry";
--> statement-breakpoint
ALTER TABLE "inventory_lots" RENAME CONSTRAINT "inventory_lots_ingredient_id_ingredients_id_fk" TO "inventory_lots_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_movements" RENAME COLUMN "ingredient_id" TO "item_id";
--> statement-breakpoint
ALTER INDEX "movement_ingredient_recent" RENAME TO "movement_item_recent";
--> statement-breakpoint
ALTER TABLE "inventory_movements" RENAME CONSTRAINT "inventory_movements_ingredient_id_ingredients_id_fk" TO "inventory_movements_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" RENAME COLUMN "ingredient_id" TO "item_id";
--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" RENAME COLUMN "ingredient_name" TO "item_name";
--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" RENAME CONSTRAINT "purchase_receipt_lines_ingredient_id_ingredients_id_fk" TO "purchase_receipt_lines_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_balances" RENAME COLUMN "ingredient_id" TO "item_id";
--> statement-breakpoint
ALTER TABLE "stock_balances" RENAME CONSTRAINT "stock_balances_ingredient_id_ingredients_id_fk" TO "stock_balances_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "recipe_options" RENAME COLUMN "ingredient_id" TO "item_id";
--> statement-breakpoint
ALTER TABLE "recipe_options" RENAME COLUMN "ingredient_name" TO "item_name";
--> statement-breakpoint
ALTER INDEX "recipe_option_ingredient" RENAME TO "recipe_option_item";
--> statement-breakpoint
ALTER TABLE "recipe_options" RENAME CONSTRAINT "recipe_options_ingredient_id_ingredients_id_fk" TO "recipe_options_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "recipes" RENAME COLUMN "output_ingredient_id" TO "output_item_id";
--> statement-breakpoint
ALTER TABLE "recipes" RENAME CONSTRAINT "recipes_output_ingredient_id_ingredients_id_fk" TO "recipes_output_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "production_allocations" RENAME COLUMN "ingredient_id" TO "item_id";
--> statement-breakpoint
ALTER TABLE "production_allocations" RENAME COLUMN "ingredient_name" TO "item_name";
--> statement-breakpoint
ALTER TABLE "production_allocations" RENAME CONSTRAINT "production_allocations_ingredient_id_ingredients_id_fk" TO "production_allocations_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "production_batches" RENAME COLUMN "output_ingredient_id" TO "output_item_id";
--> statement-breakpoint
ALTER TABLE "production_batches" RENAME CONSTRAINT "production_batches_output_ingredient_id_ingredients_id_fk" TO "production_batches_output_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "modifier_option_components" RENAME COLUMN "ingredient_id" TO "item_id";
--> statement-breakpoint
ALTER INDEX "modifier_option_components_ingredient" RENAME TO "modifier_option_components_item";
--> statement-breakpoint
ALTER TABLE "modifier_option_components" RENAME CONSTRAINT "modifier_option_components_ingredient_id_ingredients_id_fk" TO "modifier_option_components_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "recipe_modifier_option_components" RENAME COLUMN "ingredient_id" TO "item_id";
--> statement-breakpoint
ALTER INDEX "recipe_modifier_option_components_ingredient" RENAME TO "recipe_modifier_option_components_item";
--> statement-breakpoint
ALTER TABLE "recipe_modifier_option_components" RENAME CONSTRAINT "recipe_modifier_option_components_ingredient_id_ingredients_id_fk" TO "recipe_modifier_option_components_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "sale_line_components" RENAME COLUMN "ingredient_id" TO "item_id";
--> statement-breakpoint
ALTER TABLE "sale_line_components" RENAME CONSTRAINT "sale_line_components_ingredient_id_ingredients_id_fk" TO "sale_line_components_item_id_items_id_fk";
--> statement-breakpoint
CREATE TABLE "branch_memberships" (
	"branch_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "branch_memberships_branch_id_user_id_pk" PRIMARY KEY("branch_id","user_id"),
	CONSTRAINT "branch_membership_role" CHECK ("branch_memberships"."role" in ('manager','staff'))
);

--> statement-breakpoint
CREATE TABLE "branch_products" (
	"branch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"dispatch_location_id" uuid,
	CONSTRAINT "branch_products_branch_id_product_id_pk" PRIMARY KEY("branch_id","product_id")
);

--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_code_valid" CHECK ("branches"."code" ~ '^[A-Z0-9][A-Z0-9._-]*$')
);

--> statement-breakpoint
CREATE TABLE "data_model_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"cutover_at" timestamp with time zone NOT NULL,
	"mapping_hash" text NOT NULL,
	CONSTRAINT "data_model_singleton" CHECK ("data_model_state"."id"=1),
	CONSTRAINT "data_model_status" CHECK ("data_model_state"."status" in ('transitioning','ready'))
);

--> statement-breakpoint
CREATE TABLE "fulfillment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"action" text NOT NULL,
	"quantity" integer NOT NULL,
	"revision" integer NOT NULL,
	CONSTRAINT "fulfillment_event_quantity" CHECK ("fulfillment_events"."quantity">0),
	CONSTRAINT "fulfillment_event_action" CHECK ("fulfillment_events"."action" in ('complete','deliver','cancel'))
);

--> statement-breakpoint
CREATE TABLE "internal_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "inventory_valuations" (
	"item_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"quantity" numeric(18, 6) DEFAULT '0' NOT NULL,
	"value" numeric(24, 6),
	CONSTRAINT "inventory_valuations_branch_id_item_id_pk" PRIMARY KEY("branch_id","item_id"),
	CONSTRAINT "inventory_valuation_nonnegative" CHECK ("inventory_valuations"."quantity" >= 0 and ("inventory_valuations"."value" is null or "inventory_valuations"."value" >= 0))
);

--> statement-breakpoint
CREATE TABLE "location_stock_balances" (
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"quantity" numeric(18, 6) DEFAULT '0' NOT NULL,
	"reserved" numeric(18, 6) DEFAULT '0' NOT NULL,
	CONSTRAINT "location_stock_balances_item_id_location_id_pk" PRIMARY KEY("item_id","location_id"),
	CONSTRAINT "location_stock_nonnegative" CHECK ("location_stock_balances"."quantity" >= 0 and "location_stock_balances"."reserved" between 0 and "location_stock_balances"."quantity")
);

--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL
);

--> statement-breakpoint
CREATE TABLE "lot_location_balances" (
	"lot_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"quantity" numeric(18, 6) DEFAULT '0' NOT NULL,
	"reserved" numeric(18, 6) DEFAULT '0' NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "lot_location_balances_lot_id_location_id_pk" PRIMARY KEY("lot_id","location_id"),
	CONSTRAINT "lot_location_nonnegative" CHECK ("lot_location_balances"."quantity" >= 0 and "lot_location_balances"."reserved" between 0 and "lot_location_balances"."quantity")
);

--> statement-breakpoint
CREATE TABLE "lot_transition_baselines" (
	"lot_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	CONSTRAINT "lot_transition_baselines_lot_id_location_id_pk" PRIMARY KEY("lot_id","location_id"),
	CONSTRAINT "lot_baseline_nonnegative" CHECK ("lot_transition_baselines"."quantity">=0)
);

--> statement-breakpoint
CREATE TABLE "product_fulfillment_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"mode" text NOT NULL,
	"item_id" uuid,
	"quantity" numeric(18, 6),
	"recipe_version_id" uuid,
	CONSTRAINT "fulfillment_mode" CHECK (("product_fulfillment_versions"."mode"='direct' and "product_fulfillment_versions"."item_id" is not null and "product_fulfillment_versions"."quantity">0 and "product_fulfillment_versions"."recipe_version_id" is null) or ("product_fulfillment_versions"."mode"='recipe' and "product_fulfillment_versions"."recipe_version_id" is not null and "product_fulfillment_versions"."item_id" is null and "product_fulfillment_versions"."quantity" is null))
);

--> statement-breakpoint
CREATE TABLE "product_fulfillments" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"version_id" uuid NOT NULL
);

--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"recipe_version_id" uuid NOT NULL,
	"output_item_id" uuid NOT NULL,
	"planned_quantity" numeric(18, 6) NOT NULL,
	"actual_quantity" numeric(18, 6),
	"composition" jsonb NOT NULL,
	"state" text DEFAULT 'confirmed' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "production_order_state" CHECK ("production_orders"."state" in ('confirmed','completed','cancelled')),
	CONSTRAINT "production_order_quantities" CHECK ("production_orders"."planned_quantity">0 and ("production_orders"."actual_quantity" is null or "production_orders"."actual_quantity">0))
);

--> statement-breakpoint
CREATE TABLE "reservation_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"allocated" numeric(18, 6) DEFAULT '0' NOT NULL,
	"consumed" numeric(18, 6) DEFAULT '0' NOT NULL,
	"released" numeric(18, 6) DEFAULT '0' NOT NULL,
	CONSTRAINT "reservation_conservation" CHECK ("reservation_allocations"."allocated">0 and "reservation_allocations"."consumed">=0 and "reservation_allocations"."released">=0 and "reservation_allocations"."consumed"+"reservation_allocations"."released"<="reservation_allocations"."allocated")
);

--> statement-breakpoint
CREATE TABLE "sale_line_fulfillments" (
	"sale_line_id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"ordered" integer NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"cancelled" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "line_fulfillment_mode" CHECK ("sale_line_fulfillments"."mode" in ('direct','recipe')),
	CONSTRAINT "line_fulfillment_quantities" CHECK ("sale_line_fulfillments"."ordered">0 and "sale_line_fulfillments"."completed">=0 and "sale_line_fulfillments"."delivered">=0 and "sale_line_fulfillments"."cancelled">=0 and "sale_line_fulfillments"."completed"+"sale_line_fulfillments"."cancelled"<="sale_line_fulfillments"."ordered" and "sale_line_fulfillments"."delivered"+"sale_line_fulfillments"."cancelled"<="sale_line_fulfillments"."ordered" and ("sale_line_fulfillments"."mode"<>'recipe' or "sale_line_fulfillments"."delivered"<="sale_line_fulfillments"."completed"))
);

--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "stock_adjustment_kind" CHECK ("stock_adjustments"."kind" in ('opening','count','waste'))
);

--> statement-breakpoint
CREATE TABLE "stock_block_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"blocked" boolean NOT NULL,
	"reason" text NOT NULL
);

--> statement-breakpoint
CREATE TABLE "stock_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"receipt_id" uuid,
	"sale_line_id" uuid,
	"production_order_id" uuid,
	"transfer_id" uuid,
	"adjustment_id" uuid,
	"internal_use_id" uuid,
	"return_id" uuid,
	CONSTRAINT "stock_document_one_origin" CHECK (num_nonnulls("stock_documents"."receipt_id","stock_documents"."sale_line_id","stock_documents"."production_order_id","stock_documents"."transfer_id","stock_documents"."adjustment_id","stock_documents"."internal_use_id","stock_documents"."return_id")=1),
	CONSTRAINT "stock_document_origin_kind" CHECK (("stock_documents"."kind"='receipt' and "stock_documents"."receipt_id" is not null) or ("stock_documents"."kind"='sale' and "stock_documents"."sale_line_id" is not null) or ("stock_documents"."kind"='production' and "stock_documents"."production_order_id" is not null) or ("stock_documents"."kind"='transfer' and "stock_documents"."transfer_id" is not null) or ("stock_documents"."kind"='adjustment' and "stock_documents"."adjustment_id" is not null) or ("stock_documents"."kind"='internal_use' and "stock_documents"."internal_use_id" is not null) or ("stock_documents"."kind"='return' and "stock_documents"."return_id" is not null))
);

--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"sequence" bigserial NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"quantity" numeric(18, 6) NOT NULL,
	"value" numeric(24, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_sequence_unique" UNIQUE("sequence"),
	CONSTRAINT "stock_movement_nonzero" CHECK ("stock_movements"."quantity"<>0),
	CONSTRAINT "stock_movement_value_sign" CHECK ("stock_movements"."value" is null or "stock_movements"."quantity"*"stock_movements"."value">=0)
);

--> statement-breakpoint
CREATE TABLE "stock_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "reservation_state" CHECK ("stock_reservations"."state" in ('active','affected','settled'))
);

--> statement-breakpoint
CREATE TABLE "stock_resolution_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"resolution_line_id" uuid NOT NULL,
	"consumed" numeric(18, 6) NOT NULL,
	"unused" numeric(18, 6) NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "stock_resolution_event_positive" CHECK ("stock_resolution_events"."consumed">=0 and "stock_resolution_events"."unused">=0 and "stock_resolution_events"."consumed"+"stock_resolution_events"."unused">0)
);

--> statement-breakpoint
CREATE TABLE "stock_resolution_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resolution_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"pending" numeric(18, 6) NOT NULL,
	"consumed" numeric(18, 6) DEFAULT '0' NOT NULL,
	"unused" numeric(18, 6) DEFAULT '0' NOT NULL,
	CONSTRAINT "stock_resolution_conservation" CHECK ("stock_resolution_lines"."pending">0 and "stock_resolution_lines"."consumed">=0 and "stock_resolution_lines"."unused">=0 and "stock_resolution_lines"."consumed"+"stock_resolution_lines"."unused"<="stock_resolution_lines"."pending")
);

--> statement-breakpoint
CREATE TABLE "stock_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "stock_resolution_state" CHECK ("stock_resolutions"."state" in ('pending','resolved'))
);

--> statement-breakpoint
CREATE TABLE "stock_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sale_line_id" uuid NOT NULL
);

--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_branch_id" uuid NOT NULL,
	"destination_branch_id" uuid NOT NULL,
	"origin_location_id" uuid NOT NULL,
	"destination_location_id" uuid NOT NULL,
	"state" text DEFAULT 'confirmed' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "transfer_distinct_locations" CHECK ("stock_transfers"."origin_location_id" <> "stock_transfers"."destination_location_id"),
	CONSTRAINT "transfer_state" CHECK ("stock_transfers"."state" in ('confirmed','in_transit','received','resolved','cancelled'))
);

--> statement-breakpoint
CREATE TABLE "stock_transition_baselines" (
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"value" numeric(24, 6),
	CONSTRAINT "stock_transition_baselines_item_id_location_id_pk" PRIMARY KEY("item_id","location_id"),
	CONSTRAINT "stock_baseline_nonnegative" CHECK ("stock_transition_baselines"."quantity">=0 and ("stock_transition_baselines"."value" is null or "stock_transition_baselines"."value">=0))
);

--> statement-breakpoint
CREATE TABLE "transfer_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"received" numeric(18, 6) DEFAULT '0' NOT NULL,
	"resolved" numeric(18, 6) DEFAULT '0' NOT NULL,
	"dispatch_value" numeric(24, 6),
	"settled_value" numeric(24, 6) DEFAULT '0' NOT NULL,
	CONSTRAINT "transfer_value_conservation" CHECK ("transfer_allocations"."settled_value">=0 and ("transfer_allocations"."dispatch_value" is null and "transfer_allocations"."settled_value"=0 or "transfer_allocations"."dispatch_value">="transfer_allocations"."settled_value") and ("transfer_allocations"."received"+"transfer_allocations"."resolved"<"transfer_allocations"."quantity" or "transfer_allocations"."dispatch_value" is null or "transfer_allocations"."settled_value"="transfer_allocations"."dispatch_value")),
	CONSTRAINT "transfer_allocation_quantities" CHECK ("transfer_allocations"."quantity">0 and "transfer_allocations"."received">=0 and "transfer_allocations"."resolved">=0 and "transfer_allocations"."received"+"transfer_allocations"."resolved"<="transfer_allocations"."quantity")
);

--> statement-breakpoint
CREATE TABLE "transfer_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"value" numeric(24, 6),
	"reason" text NOT NULL,
	CONSTRAINT "transfer_resolution_kind" CHECK ("transfer_resolutions"."kind" in ('loss','return')),
	CONSTRAINT "transfer_resolution_quantity" CHECK ("transfer_resolutions"."quantity">0 and ("transfer_resolutions"."value" is null or "transfer_resolutions"."value">=0))
);

--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "item_base_unit";
--> statement-breakpoint
DROP INDEX "receipt_supplier_document";
--> statement-breakpoint
DROP INDEX "table_active_cell";
--> statement-breakpoint
DROP INDEX "sale_external_identity";
--> statement-breakpoint
DROP INDEX "preparation_station_name";
--> statement-breakpoint
ALTER TABLE "preparation_routes" DROP CONSTRAINT "preparation_routes_pkey";
--> statement-breakpoint
ALTER TABLE "operational_users" ADD COLUMN "catalog_manager" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "code" varchar(64);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "class" text;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "purchasable" boolean;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "recipe_usable" boolean;
--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD COLUMN "branch_id" uuid;
--> statement-breakpoint
ALTER TABLE "production_batches" ADD COLUMN "branch_id" uuid;
--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "branch_id" uuid;
--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "branch_id" uuid;
--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "fulfillment_version_id" uuid;
--> statement-breakpoint
ALTER TABLE "sale_orders" ADD COLUMN "branch_id" uuid;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "branch_id" uuid;
--> statement-breakpoint
ALTER TABLE "preparation_routes" ADD COLUMN "branch_id" uuid;
--> statement-breakpoint
ALTER TABLE "preparation_stations" ADD COLUMN "branch_id" uuid;
--> statement-breakpoint
ALTER TABLE "preparation_stations" ADD COLUMN "consumption_location_id" uuid;
--> statement-breakpoint
ALTER TABLE "preparation_tasks" ADD COLUMN "branch_id" uuid;
--> statement-breakpoint
CREATE UNIQUE INDEX "branch_code" ON "branches" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX "line_fulfillment_revision" ON "fulfillment_events" USING btree ("sale_line_id","revision");
--> statement-breakpoint
CREATE UNIQUE INDEX "internal_use_branch" ON "internal_uses" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "location_branch_code" ON "locations" USING btree ("branch_id","code");
--> statement-breakpoint
CREATE UNIQUE INDEX "location_branch_identity" ON "locations" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "lot_location_branch" ON "lot_location_balances" USING btree ("lot_id","location_id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_product_version" ON "product_fulfillment_versions" USING btree ("product_id","version");
--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_version_owner" ON "product_fulfillment_versions" USING btree ("id","product_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "production_order_branch" ON "production_orders" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_lot_location" ON "reservation_allocations" USING btree ("reservation_id","lot_id","location_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "sale_line_fulfillment_branch" ON "sale_line_fulfillments" USING btree ("sale_line_id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_adjustment_branch" ON "stock_adjustments" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_document_branch" ON "stock_documents" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_operation_request" ON "stock_operations" USING btree ("request_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_operation_branch" ON "stock_operations" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_document" ON "stock_reservations" USING btree ("document_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_branch" ON "stock_reservations" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "resolution_allocation" ON "stock_resolution_lines" USING btree ("resolution_id","allocation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_resolution_sale" ON "stock_resolutions" USING btree ("sale_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_resolution_branch" ON "stock_resolutions" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_return_branch" ON "stock_returns" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_lot" ON "transfer_allocations" USING btree ("transfer_id","lot_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "item_code_unique" ON "items" USING btree ("code");
--> statement-breakpoint
CREATE UNIQUE INDEX "lot_item_identity" ON "inventory_lots" USING btree ("id","item_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_branch" ON "purchase_receipts" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "table_branch_identity" ON "dining_tables" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "table_active_name" ON "dining_tables" USING btree ("branch_id",lower("name")) WHERE "dining_tables"."archived_at" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "sale_line_branch" ON "sale_lines" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "sale_line_product" ON "sale_lines" USING btree ("id","product_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "sale_order_branch" ON "sale_orders" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "sale_branch_identity" ON "sales" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "preparation_station_branch" ON "preparation_stations" USING btree ("id","branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_supplier_document" ON "purchase_receipts" USING btree ("branch_id","supplier_id","document_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "table_active_cell" ON "dining_tables" USING btree ("branch_id","x","y") WHERE "dining_tables"."archived_at" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "sale_external_identity" ON "sales" USING btree ("branch_id","channel","external_id") WHERE "sales"."external_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "preparation_station_name" ON "preparation_stations" USING btree ("branch_id",lower("name")) WHERE "preparation_stations"."archived_at" is null;
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "item_code_valid" CHECK ("items"."code" ~ '^[A-Z0-9][A-Z0-9._-]*$');
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "item_class_valid" CHECK ("items"."class" in ('food','beverage','packaging','cleaning','other','unclassified'));
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "item_unit_valid" CHECK ("items"."base_unit" in ('g','ml','unit'));
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "item_recipe_safe" CHECK ("items"."class" not in ('cleaning','unclassified') or not "items"."recipe_usable");
--> statement-breakpoint
ALTER TABLE "branch_memberships" ADD CONSTRAINT "branch_memberships_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "branch_memberships" ADD CONSTRAINT "branch_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "branch_products" ADD CONSTRAINT "branch_products_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "branch_products" ADD CONSTRAINT "branch_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "branch_products" ADD CONSTRAINT "branch_product_dispatch_location" FOREIGN KEY ("dispatch_location_id","branch_id") REFERENCES "public"."locations"("id","branch_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fulfillment_events" ADD CONSTRAINT "fulfillment_events_sale_line_id_branch_id_sale_line_fulfillments_sale_line_id_branch_id_fk" FOREIGN KEY ("sale_line_id","branch_id") REFERENCES "public"."sale_line_fulfillments"("sale_line_id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fulfillment_events" ADD CONSTRAINT "fulfillment_events_operation_id_branch_id_stock_operations_id_branch_id_fk" FOREIGN KEY ("operation_id","branch_id") REFERENCES "public"."stock_operations"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "internal_uses" ADD CONSTRAINT "internal_uses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "internal_uses" ADD CONSTRAINT "internal_uses_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_valuations" ADD CONSTRAINT "inventory_valuations_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_valuations" ADD CONSTRAINT "inventory_valuations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_stock_balances" ADD CONSTRAINT "location_stock_balances_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "location_stock_balances" ADD CONSTRAINT "location_stock_balances_location_id_branch_id_locations_id_branch_id_fk" FOREIGN KEY ("location_id","branch_id") REFERENCES "public"."locations"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lot_location_balances" ADD CONSTRAINT "lot_location_balances_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lot_location_balances" ADD CONSTRAINT "lot_location_balances_location_id_branch_id_locations_id_branch_id_fk" FOREIGN KEY ("location_id","branch_id") REFERENCES "public"."locations"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lot_transition_baselines" ADD CONSTRAINT "lot_transition_baselines_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lot_transition_baselines" ADD CONSTRAINT "lot_transition_baselines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_fulfillment_versions" ADD CONSTRAINT "product_fulfillment_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_fulfillment_versions" ADD CONSTRAINT "product_fulfillment_versions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_fulfillment_versions" ADD CONSTRAINT "product_fulfillment_versions_recipe_version_id_recipe_versions_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_fulfillments" ADD CONSTRAINT "product_fulfillments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_fulfillments" ADD CONSTRAINT "product_fulfillments_version_id_product_id_product_fulfillment_versions_id_product_id_fk" FOREIGN KEY ("version_id","product_id") REFERENCES "public"."product_fulfillment_versions"("id","product_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_recipe_version_id_recipe_versions_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_output_item_id_items_id_fk" FOREIGN KEY ("output_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_location_id_branch_id_locations_id_branch_id_fk" FOREIGN KEY ("location_id","branch_id") REFERENCES "public"."locations"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_allocations" ADD CONSTRAINT "reservation_allocations_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_allocations" ADD CONSTRAINT "reservation_allocations_lot_id_item_id_inventory_lots_id_item_id_fk" FOREIGN KEY ("lot_id","item_id") REFERENCES "public"."inventory_lots"("id","item_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_allocations" ADD CONSTRAINT "reservation_allocations_reservation_id_branch_id_stock_reservations_id_branch_id_fk" FOREIGN KEY ("reservation_id","branch_id") REFERENCES "public"."stock_reservations"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_allocations" ADD CONSTRAINT "reservation_allocations_lot_id_location_id_branch_id_lot_location_balances_lot_id_location_id_branch_id_fk" FOREIGN KEY ("lot_id","location_id","branch_id") REFERENCES "public"."lot_location_balances"("lot_id","location_id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_line_fulfillments" ADD CONSTRAINT "sale_line_fulfillments_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_line_fulfillments" ADD CONSTRAINT "sale_line_fulfillments_version_id_product_fulfillment_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."product_fulfillment_versions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_line_fulfillments" ADD CONSTRAINT "sale_line_fulfillments_document_id_branch_id_stock_documents_id_branch_id_fk" FOREIGN KEY ("document_id","branch_id") REFERENCES "public"."stock_documents"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_line_fulfillments" ADD CONSTRAINT "sale_line_fulfillments_reservation_id_branch_id_stock_reservations_id_branch_id_fk" FOREIGN KEY ("reservation_id","branch_id") REFERENCES "public"."stock_reservations"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_block_events" ADD CONSTRAINT "stock_block_events_operation_id_stock_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."stock_operations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_block_events" ADD CONSTRAINT "stock_block_events_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_block_events" ADD CONSTRAINT "stock_block_events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_receipt_id_branch_id_purchase_receipts_id_branch_id_fk" FOREIGN KEY ("receipt_id","branch_id") REFERENCES "public"."purchase_receipts"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_sale_line_id_branch_id_sale_lines_id_branch_id_fk" FOREIGN KEY ("sale_line_id","branch_id") REFERENCES "public"."sale_lines"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_production_order_id_branch_id_production_orders_id_branch_id_fk" FOREIGN KEY ("production_order_id","branch_id") REFERENCES "public"."production_orders"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_adjustment_id_branch_id_stock_adjustments_id_branch_id_fk" FOREIGN KEY ("adjustment_id","branch_id") REFERENCES "public"."stock_adjustments"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_internal_use_id_branch_id_internal_uses_id_branch_id_fk" FOREIGN KEY ("internal_use_id","branch_id") REFERENCES "public"."internal_uses"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_return_id_branch_id_stock_returns_id_branch_id_fk" FOREIGN KEY ("return_id","branch_id") REFERENCES "public"."stock_returns"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_item_id_inventory_lots_id_item_id_fk" FOREIGN KEY ("lot_id","item_id") REFERENCES "public"."inventory_lots"("id","item_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_document_id_branch_id_stock_documents_id_branch_id_fk" FOREIGN KEY ("document_id","branch_id") REFERENCES "public"."stock_documents"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_operation_id_branch_id_stock_operations_id_branch_id_fk" FOREIGN KEY ("operation_id","branch_id") REFERENCES "public"."stock_operations"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_location_id_branch_id_lot_location_balances_lot_id_location_id_branch_id_fk" FOREIGN KEY ("lot_id","location_id","branch_id") REFERENCES "public"."lot_location_balances"("lot_id","location_id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_operations" ADD CONSTRAINT "stock_operations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_operations" ADD CONSTRAINT "stock_operations_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_document_id_branch_id_stock_documents_id_branch_id_fk" FOREIGN KEY ("document_id","branch_id") REFERENCES "public"."stock_documents"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_operation_id_branch_id_stock_operations_id_branch_id_fk" FOREIGN KEY ("operation_id","branch_id") REFERENCES "public"."stock_operations"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_resolution_events" ADD CONSTRAINT "stock_resolution_events_operation_id_stock_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."stock_operations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_resolution_events" ADD CONSTRAINT "stock_resolution_events_resolution_line_id_stock_resolution_lines_id_fk" FOREIGN KEY ("resolution_line_id") REFERENCES "public"."stock_resolution_lines"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_resolution_lines" ADD CONSTRAINT "stock_resolution_lines_allocation_id_reservation_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."reservation_allocations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_resolution_lines" ADD CONSTRAINT "stock_resolution_lines_resolution_id_branch_id_stock_resolutions_id_branch_id_fk" FOREIGN KEY ("resolution_id","branch_id") REFERENCES "public"."stock_resolutions"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_resolution_lines" ADD CONSTRAINT "stock_resolution_lines_sale_line_id_branch_id_sale_line_fulfillments_sale_line_id_branch_id_fk" FOREIGN KEY ("sale_line_id","branch_id") REFERENCES "public"."sale_line_fulfillments"("sale_line_id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_resolutions" ADD CONSTRAINT "stock_resolutions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_resolutions" ADD CONSTRAINT "stock_resolutions_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_resolutions" ADD CONSTRAINT "stock_resolution_sale_branch" FOREIGN KEY ("sale_id","branch_id") REFERENCES "public"."sales"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_returns" ADD CONSTRAINT "stock_returns_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_returns" ADD CONSTRAINT "stock_returns_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_returns" ADD CONSTRAINT "stock_returns_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_returns" ADD CONSTRAINT "stock_return_sale_branch" FOREIGN KEY ("sale_line_id","branch_id") REFERENCES "public"."sale_lines"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_origin_branch_id_branches_id_fk" FOREIGN KEY ("origin_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_branch_id_branches_id_fk" FOREIGN KEY ("destination_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_origin_location_id_origin_branch_id_locations_id_branch_id_fk" FOREIGN KEY ("origin_location_id","origin_branch_id") REFERENCES "public"."locations"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_location_id_destination_branch_id_locations_id_branch_id_fk" FOREIGN KEY ("destination_location_id","destination_branch_id") REFERENCES "public"."locations"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_transition_baselines" ADD CONSTRAINT "stock_transition_baselines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_transition_baselines" ADD CONSTRAINT "stock_transition_baselines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer_allocations" ADD CONSTRAINT "transfer_allocations_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer_allocations" ADD CONSTRAINT "transfer_allocations_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer_allocations" ADD CONSTRAINT "transfer_allocations_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer_allocations" ADD CONSTRAINT "transfer_lot_item" FOREIGN KEY ("lot_id","item_id") REFERENCES "public"."inventory_lots"("id","item_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer_resolutions" ADD CONSTRAINT "transfer_resolutions_operation_id_stock_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."stock_operations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer_resolutions" ADD CONSTRAINT "transfer_resolutions_allocation_id_transfer_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."transfer_allocations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_fulfillment_version_id_product_fulfillment_versions_id_fk" FOREIGN KEY ("fulfillment_version_id") REFERENCES "public"."product_fulfillment_versions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_order_id_branch_id_sale_orders_id_branch_id_fk" FOREIGN KEY ("order_id","branch_id") REFERENCES "public"."sale_orders"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_fulfillment_version_id_product_id_product_fulfillment_versions_id_product_id_fk" FOREIGN KEY ("fulfillment_version_id","product_id") REFERENCES "public"."product_fulfillment_versions"("id","product_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_sale_id_branch_id_sales_id_branch_id_fk" FOREIGN KEY ("sale_id","branch_id") REFERENCES "public"."sales"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_table_id_branch_id_dining_tables_id_branch_id_fk" FOREIGN KEY ("table_id","branch_id") REFERENCES "public"."dining_tables"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preparation_routes" ADD CONSTRAINT "preparation_routes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preparation_routes" ADD CONSTRAINT "preparation_routes_station_id_branch_id_preparation_stations_id_branch_id_fk" FOREIGN KEY ("station_id","branch_id") REFERENCES "public"."preparation_stations"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preparation_stations" ADD CONSTRAINT "preparation_stations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preparation_stations" ADD CONSTRAINT "preparation_stations_consumption_location_id_locations_id_fk" FOREIGN KEY ("consumption_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preparation_stations" ADD CONSTRAINT "preparation_stations_consumption_location_id_branch_id_locations_id_branch_id_fk" FOREIGN KEY ("consumption_location_id","branch_id") REFERENCES "public"."locations"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preparation_tasks" ADD CONSTRAINT "preparation_tasks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preparation_tasks" ADD CONSTRAINT "preparation_tasks_order_id_branch_id_sale_orders_id_branch_id_fk" FOREIGN KEY ("order_id","branch_id") REFERENCES "public"."sale_orders"("id","branch_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preparation_tasks" ADD CONSTRAINT "preparation_tasks_station_id_branch_id_preparation_stations_id_branch_id_fk" FOREIGN KEY ("station_id","branch_id") REFERENCES "public"."preparation_stations"("id","branch_id") ON DELETE no action ON UPDATE no action;
