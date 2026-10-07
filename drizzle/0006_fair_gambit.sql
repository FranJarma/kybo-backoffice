CREATE TABLE "modifier_group_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_option_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_unit" text NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	CONSTRAINT "modifier_option_components_positive" CHECK ("modifier_option_components"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "modifier_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_version_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"instruction" text,
	"position" integer NOT NULL,
	CONSTRAINT "modifier_option_kind" CHECK ("modifier_options"."kind" in ('composition','instruction'))
);
--> statement-breakpoint
CREATE TABLE "recipe_modifier_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_version_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"group_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"min" integer NOT NULL,
	"max" integer NOT NULL,
	"factor" numeric(18, 6) NOT NULL,
	CONSTRAINT "recipe_modifier_limits" CHECK ("recipe_modifier_groups"."min" >= 0 and "recipe_modifier_groups"."max" >= "recipe_modifier_groups"."min" and "recipe_modifier_groups"."factor" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_modifier_option_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_modifier_option_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_unit" text NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	CONSTRAINT "recipe_modifier_option_components_positive" CHECK ("recipe_modifier_option_components"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_modifier_option_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_modifier_option_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"surcharge" numeric(14, 2) NOT NULL,
	CONSTRAINT "modifier_price_valid" CHECK ("recipe_modifier_option_prices"."surcharge" >= 0 and "recipe_modifier_option_prices"."channel" in ('counter','pedidosya','ubereats'))
);
--> statement-breakpoint
CREATE TABLE "recipe_modifier_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_modifier_group_id" uuid NOT NULL,
	"group_version_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"recipe_version_id" uuid NOT NULL,
	"enabled" boolean NOT NULL,
	"default_count" integer NOT NULL,
	"max_count" integer NOT NULL,
	"mode" text NOT NULL,
	CONSTRAINT "recipe_modifier_option_rules" CHECK ("recipe_modifier_options"."default_count" >= 0 and "recipe_modifier_options"."max_count" >= "recipe_modifier_options"."default_count" and "recipe_modifier_options"."mode" in ('inherit','override'))
);
--> statement-breakpoint
CREATE TABLE "sale_line_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_unit" text NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	CONSTRAINT "sale_component_positive" CHECK ("sale_line_components"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_line_modifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"recipe_version_id" uuid NOT NULL,
	"recipe_modifier_option_id" uuid NOT NULL,
	"group_name" text NOT NULL,
	"option_name" text NOT NULL,
	"count" integer NOT NULL,
	"instruction" text,
	"unit_surcharge" numeric(14, 2) NOT NULL,
	CONSTRAINT "sale_modifier_count" CHECK ("sale_line_modifiers"."count" > 0 and "sale_line_modifiers"."unit_surcharge" >= 0)
);
--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD COLUMN "composition_model" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "composition_status" text DEFAULT 'legacy_unknown' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "modifier_version_number" ON "modifier_group_versions" USING btree ("group_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "modifier_option_components_once" ON "modifier_option_components" USING btree ("option_id","ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "modifier_option_key" ON "modifier_options" USING btree ("group_version_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "modifier_option_owner" ON "modifier_options" USING btree ("id","group_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_modifier_group_once" ON "recipe_modifier_groups" USING btree ("recipe_version_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_modifier_group_owner" ON "recipe_modifier_groups" USING btree ("id","group_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_modifier_group_recipe" ON "recipe_modifier_groups" USING btree ("id","recipe_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_modifier_option_components_once" ON "recipe_modifier_option_components" USING btree ("recipe_modifier_option_id","ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "modifier_price_channel" ON "recipe_modifier_option_prices" USING btree ("recipe_modifier_option_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_modifier_option_once" ON "recipe_modifier_options" USING btree ("recipe_modifier_group_id","option_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_modifier_option_recipe" ON "recipe_modifier_options" USING btree ("id","recipe_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_component_once" ON "sale_line_components" USING btree ("sale_line_id","ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_modifier_once" ON "sale_line_modifiers" USING btree ("sale_line_id","recipe_modifier_option_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_line_recipe_owner" ON "sale_lines" USING btree ("id","recipe_version_id");--> statement-breakpoint
ALTER TABLE "modifier_group_versions" ADD CONSTRAINT "modifier_group_versions_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_group_versions" ADD CONSTRAINT "modifier_group_versions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_option_components" ADD CONSTRAINT "modifier_option_components_option_id_modifier_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."modifier_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_option_components" ADD CONSTRAINT "modifier_option_components_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_group_version_id_modifier_group_versions_id_fk" FOREIGN KEY ("group_version_id") REFERENCES "public"."modifier_group_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_modifier_groups" ADD CONSTRAINT "recipe_modifier_groups_recipe_version_id_recipe_versions_id_fk" FOREIGN KEY ("recipe_version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_modifier_groups" ADD CONSTRAINT "recipe_modifier_groups_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_modifier_groups" ADD CONSTRAINT "recipe_modifier_groups_group_version_id_modifier_group_versions_id_fk" FOREIGN KEY ("group_version_id") REFERENCES "public"."modifier_group_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_modifier_option_components" ADD CONSTRAINT "recipe_modifier_option_components_recipe_modifier_option_id_recipe_modifier_options_id_fk" FOREIGN KEY ("recipe_modifier_option_id") REFERENCES "public"."recipe_modifier_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_modifier_option_components" ADD CONSTRAINT "recipe_modifier_option_components_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_modifier_option_prices" ADD CONSTRAINT "recipe_modifier_option_prices_recipe_modifier_option_id_recipe_modifier_options_id_fk" FOREIGN KEY ("recipe_modifier_option_id") REFERENCES "public"."recipe_modifier_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_modifier_options" ADD CONSTRAINT "recipe_modifier_options_recipe_modifier_group_id_group_version_id_recipe_modifier_groups_id_group_version_id_fk" FOREIGN KEY ("recipe_modifier_group_id","group_version_id") REFERENCES "public"."recipe_modifier_groups"("id","group_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_modifier_options" ADD CONSTRAINT "recipe_modifier_options_option_id_group_version_id_modifier_options_id_group_version_id_fk" FOREIGN KEY ("option_id","group_version_id") REFERENCES "public"."modifier_options"("id","group_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_modifier_options" ADD CONSTRAINT "recipe_modifier_options_recipe_modifier_group_id_recipe_version_id_recipe_modifier_groups_id_recipe_version_id_fk" FOREIGN KEY ("recipe_modifier_group_id","recipe_version_id") REFERENCES "public"."recipe_modifier_groups"("id","recipe_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_components" ADD CONSTRAINT "sale_line_components_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_components" ADD CONSTRAINT "sale_line_components_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_modifiers" ADD CONSTRAINT "sale_line_modifiers_recipe_modifier_option_id_recipe_version_id_recipe_modifier_options_id_recipe_version_id_fk" FOREIGN KEY ("recipe_modifier_option_id","recipe_version_id") REFERENCES "public"."recipe_modifier_options"("id","recipe_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_modifiers" ADD CONSTRAINT "sale_line_modifiers_sale_line_id_recipe_version_id_sale_lines_id_recipe_version_id_fk" FOREIGN KEY ("sale_line_id","recipe_version_id") REFERENCES "public"."sale_lines"("id","recipe_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "modifier_option_components_ingredient" ON "modifier_option_components" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "recipe_modifier_option_components_ingredient" ON "recipe_modifier_option_components" USING btree ("ingredient_id");