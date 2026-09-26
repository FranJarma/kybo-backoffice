CREATE TABLE "inventory_lot_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"blocked" boolean NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"receipt_id" uuid,
	"received_on" date NOT NULL,
	"expires_on" date,
	"lot_code" varchar(120),
	"initial_quantity" numeric(18, 6) NOT NULL,
	"remaining_quantity" numeric(18, 6) NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lot_quantities_nonnegative" CHECK ("inventory_lots"."initial_quantity" >= 0 and "inventory_lots"."remaining_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"delta" numeric(18, 6) NOT NULL,
	"unit_cost" numeric(24, 6),
	"value_delta" numeric(24, 6),
	"reason" text,
	"reference_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movement_kind" CHECK ("inventory_movements"."kind" in ('receipt','opening','waste','count'))
);
--> statement-breakpoint
CREATE TABLE "inventory_operations" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"kind" text NOT NULL,
	"fingerprint" text NOT NULL,
	"result_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"payment_method_name" varchar(160) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"paid_on" date NOT NULL,
	"reference" varchar(160),
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amount_positive" CHECK ("purchase_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"ingredient_name" varchar(160) NOT NULL,
	"base_unit" text NOT NULL,
	"presentation_id" uuid,
	"presentation_name" varchar(160),
	"conversion_factor" numeric(18, 6) NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"base_quantity" numeric(18, 6) NOT NULL,
	"unit_price" numeric(18, 6),
	"discount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(18, 2),
	"lot_id" uuid NOT NULL,
	"lot_code" varchar(120),
	"expires_on" date,
	CONSTRAINT "receipt_line_quantity_positive" CHECK ("purchase_receipt_lines"."quantity" > 0 and "purchase_receipt_lines"."base_quantity" > 0 and "purchase_receipt_lines"."conversion_factor" > 0),
	CONSTRAINT "receipt_line_price_nonnegative" CHECK ("purchase_receipt_lines"."unit_price" is null or "purchase_receipt_lines"."unit_price" >= 0),
	CONSTRAINT "receipt_line_cost_valid" CHECK ("purchase_receipt_lines"."discount" >= 0 and ("purchase_receipt_lines"."line_total" is null or "purchase_receipt_lines"."line_total" >= 0))
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_name" varchar(160) NOT NULL,
	"received_on" date NOT NULL,
	"document_number" varchar(120),
	"notes" text,
	"total_amount" numeric(18, 2),
	"paid_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_total_positive" CHECK ("purchase_receipts"."total_amount" is null or "purchase_receipts"."total_amount" >= 0),
	CONSTRAINT "receipt_paid_nonnegative" CHECK ("purchase_receipts"."paid_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"ingredient_id" uuid PRIMARY KEY NOT NULL,
	"physical_quantity" numeric(18, 6) DEFAULT '0' NOT NULL,
	"stock_value" numeric(24, 6),
	CONSTRAINT "balance_quantity_nonnegative" CHECK ("stock_balances"."physical_quantity" >= 0),
	CONSTRAINT "balance_value_nonnegative" CHECK ("stock_balances"."stock_value" is null or "stock_balances"."stock_value" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_lot_events" ADD CONSTRAINT "inventory_lot_events_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lot_events" ADD CONSTRAINT "inventory_lot_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_operations" ADD CONSTRAINT "inventory_operations_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_presentation_id_purchase_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."purchase_presentations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lot_event_lot" ON "inventory_lot_events" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "lot_ingredient_expiry" ON "inventory_lots" USING btree ("ingredient_id","expires_on");--> statement-breakpoint
CREATE INDEX "movement_ingredient_recent" ON "inventory_movements" USING btree ("ingredient_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_receipt" ON "purchase_payments" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "receipt_lines_receipt" ON "purchase_receipt_lines" USING btree ("receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_line_lot" ON "purchase_receipt_lines" USING btree ("lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_supplier_document" ON "purchase_receipts" USING btree ("supplier_id","document_number");