CREATE TABLE "production_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"ingredient_name" text NOT NULL,
	"base_unit" text NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"total_cost" numeric(24, 6),
	"unit_cost" numeric(24, 6),
	CONSTRAINT "production_allocation_positive" CHECK ("production_allocations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_version_id" uuid NOT NULL,
	"output_ingredient_id" uuid NOT NULL,
	"output_name" text NOT NULL,
	"base_unit" text NOT NULL,
	"output_lot_id" uuid NOT NULL,
	"multiplier" numeric(18, 6) NOT NULL,
	"expected_output" numeric(18, 6) NOT NULL,
	"actual_output" numeric(18, 6) NOT NULL,
	"total_cost" numeric(24, 6),
	"unit_cost" numeric(24, 6),
	"produced_on" date NOT NULL,
	"expires_on" date,
	"lot_code" text,
	"notes" text,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_positive" CHECK ("production_batches"."multiplier" > 0 and "production_batches"."expected_output" > 0 and "production_batches"."actual_output" > 0),
	CONSTRAINT "production_cost_valid" CHECK (("production_batches"."total_cost" is null or "production_batches"."total_cost" >= 0) and ("production_batches"."unit_cost" is null or "production_batches"."unit_cost" >= 0))
);
--> statement-breakpoint
CREATE TABLE "production_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"option_id" uuid,
	"quantity" numeric(18, 6) NOT NULL,
	CONSTRAINT "production_selection_quantity" CHECK (("production_selections"."option_id" is null and "production_selections"."quantity" = 0) or ("production_selections"."option_id" is not null and "production_selections"."quantity" > 0))
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "movement_kind";--> statement-breakpoint
ALTER TABLE "production_allocations" ADD CONSTRAINT "production_allocations_batch_id_production_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."production_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_allocations" ADD CONSTRAINT "production_allocations_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_allocations" ADD CONSTRAINT "production_allocations_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_recipe_version_id_recipe_versions_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_output_ingredient_id_ingredients_id_fk" FOREIGN KEY ("output_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_output_lot_id_inventory_lots_id_fk" FOREIGN KEY ("output_lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_selections" ADD CONSTRAINT "production_selections_batch_id_production_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."production_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_selections" ADD CONSTRAINT "production_selections_line_id_recipe_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."recipe_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_selections" ADD CONSTRAINT "production_selections_option_id_recipe_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."recipe_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "production_allocation_position" ON "production_allocations" USING btree ("batch_id","position");--> statement-breakpoint
CREATE INDEX "production_recent" ON "production_batches" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "production_output_lot" ON "production_batches" USING btree ("output_lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_selected_line" ON "production_selections" USING btree ("batch_id","line_id");--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "movement_kind" CHECK ("inventory_movements"."kind" in ('receipt','opening','waste','count','production_in','production_out'));