CREATE TABLE "item_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"presentation_id" uuid NOT NULL,
	"presentation_name" varchar(160) NOT NULL,
	"supplier_name" varchar(160) NOT NULL,
	"base_quantity" numeric(18, 6) NOT NULL,
	"base_unit" text NOT NULL,
	"price" numeric(18, 6) NOT NULL,
	"quoted_on" date NOT NULL,
	"valid_until" date,
	"lead_time_days" integer,
	"minimum_packs" integer DEFAULT 1 NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_quote_quantity" CHECK ("supplier_quotes"."base_quantity" > 0),
	CONSTRAINT "supplier_quote_price" CHECK ("supplier_quotes"."price" >= 0),
	CONSTRAINT "supplier_quote_unit" CHECK ("supplier_quotes"."base_unit" in ('g','ml','unit')),
	CONSTRAINT "supplier_quote_validity" CHECK ("supplier_quotes"."valid_until" is null or "supplier_quotes"."valid_until" >= "supplier_quotes"."quoted_on"),
	CONSTRAINT "supplier_quote_lead_time" CHECK ("supplier_quotes"."lead_time_days" is null or "supplier_quotes"."lead_time_days" between 0 and 365),
	CONSTRAINT "supplier_quote_minimum" CHECK ("supplier_quotes"."minimum_packs" between 1 and 1000000)
);
--> statement-breakpoint
ALTER TABLE "item_suppliers" ADD CONSTRAINT "item_suppliers_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_suppliers" ADD CONSTRAINT "item_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_presentation_id_purchase_presentations_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."purchase_presentations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_supplier_unique" ON "item_suppliers" USING btree ("item_id","supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_quote_item_date" ON "supplier_quotes" USING btree ("item_id","quoted_on","created_at");--> statement-breakpoint
CREATE INDEX "supplier_quote_presentation_date" ON "supplier_quotes" USING btree ("presentation_id","quoted_on","created_at");