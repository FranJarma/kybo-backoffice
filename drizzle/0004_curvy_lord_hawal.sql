CREATE TABLE "dining_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"capacity" integer NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_grid_bounds" CHECK ("dining_tables"."x" between 0 and 5 and "dining_tables"."y" between 0 and 5 and "dining_tables"."capacity" between 1 and 30)
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"list_price" numeric(14, 2),
	"unit_price" numeric(14, 2) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"price_reason" text,
	"notes" text,
	"recipe_version_id" uuid,
	CONSTRAINT "sale_line_values" CHECK ("sale_lines"."quantity" between 1 and 999 and "sale_lines"."unit_price" >= 0 and "sale_lines"."line_total" = "sale_lines"."unit_price" * "sale_lines"."quantity" and ("sale_lines"."list_price" is null or "sale_lines"."list_price" >= 0))
);
--> statement-breakpoint
CREATE TABLE "sale_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"notes" text,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"collector" text NOT NULL,
	"method_id" uuid,
	"method_name" text,
	"method_kind" text,
	"amount" numeric(14, 2) NOT NULL,
	"reference" text,
	"original_payment_id" uuid,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_payment_amount" CHECK ("sale_payments"."amount" > 0),
	CONSTRAINT "sale_payment_collector" CHECK (("sale_payments"."collector" = 'local' and "sale_payments"."method_id" is not null) or ("sale_payments"."collector" = 'platform' and "sale_payments"."method_id" is null)),
	CONSTRAINT "sale_payment_kind" CHECK (("sale_payments"."kind" = 'collection' and "sale_payments"."original_payment_id" is null) or ("sale_payments"."kind" = 'refund' and "sale_payments"."original_payment_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" serial NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"origin" text NOT NULL,
	"channel" text NOT NULL,
	"fulfillment" text NOT NULL,
	"status" text NOT NULL,
	"table_id" uuid,
	"table_name" text,
	"customer_id" uuid,
	"customer_name" text,
	"external_id" text,
	"notes" text,
	"total_amount" numeric(14, 2) NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"business_date" date NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	CONSTRAINT "sale_origin" CHECK ("sales"."origin" in ('counter','table','delivery')),
	CONSTRAINT "sale_channel" CHECK (("sales"."origin" = 'delivery' and "sales"."channel" in ('pedidosya','ubereats') and "sales"."external_id" is not null and "sales"."fulfillment" in ('delivery','pickup') and "sales"."table_id" is null) or ("sales"."origin" in ('counter','table') and "sales"."channel" = 'counter' and "sales"."external_id" is null and "sales"."fulfillment" in ('takeaway','dine_in'))),
	CONSTRAINT "sale_table_required" CHECK ("sales"."origin" <> 'table' or ("sales"."table_id" is not null and "sales"."fulfillment" = 'dine_in')),
	CONSTRAINT "sale_amounts" CHECK ("sales"."total_amount" >= 0 and "sales"."paid_amount" >= 0 and "sales"."paid_amount" <= "sales"."total_amount"),
	CONSTRAINT "sale_status" CHECK ("sales"."status" in ('open','closed','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_order_id_sale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sale_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_recipe_version_id_recipe_versions_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_method_id_payment_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."payment_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_original_payment_id_sale_payments_id_fk" FOREIGN KEY ("original_payment_id") REFERENCES "public"."sale_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "table_active_cell" ON "dining_tables" USING btree ("x","y") WHERE "dining_tables"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sale_line_position" ON "sale_lines" USING btree ("order_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_order_sequence" ON "sale_orders" USING btree ("sale_id","sequence");--> statement-breakpoint
CREATE INDEX "sale_payment_sale" ON "sale_payments" USING btree ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_payment_refund_once" ON "sale_payments" USING btree ("original_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_number" ON "sales" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_external_identity" ON "sales" USING btree ("channel","external_id") WHERE "sales"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sale_open_table" ON "sales" USING btree ("table_id") WHERE "sales"."origin" = 'table' and "sales"."status" = 'open';--> statement-breakpoint
CREATE INDEX "sale_date" ON "sales" USING btree ("business_date","created_at");