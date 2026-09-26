CREATE TABLE "recipe_graph_lock" (
	"id" integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"optional" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"ingredient_name" text NOT NULL,
	"base_unit" text NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	CONSTRAINT "recipe_option_quantity_positive" CHECK ("recipe_options"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"output_name" text NOT NULL,
	"output_unit" text NOT NULL,
	"yield_quantity" numeric(18, 6) NOT NULL,
	"notes" text,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_yield_positive" CHECK ("recipe_versions"."yield_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"product_id" uuid,
	"output_ingredient_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_target" CHECK (("recipes"."kind" = 'product' and "recipes"."product_id" is not null and "recipes"."output_ingredient_id" is null) or ("recipes"."kind" = 'preparation' and "recipes"."product_id" is null and "recipes"."output_ingredient_id" is not null)),
	CONSTRAINT "recipe_revision_positive" CHECK ("recipes"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_version_id_recipe_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."recipe_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_options" ADD CONSTRAINT "recipe_options_line_id_recipe_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."recipe_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_options" ADD CONSTRAINT "recipe_options_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_output_ingredient_id_ingredients_id_fk" FOREIGN KEY ("output_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_line_position" ON "recipe_lines" USING btree ("version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_option_position" ON "recipe_options" USING btree ("line_id","position");--> statement-breakpoint
CREATE INDEX "recipe_option_ingredient" ON "recipe_options" USING btree ("ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_version_number" ON "recipe_versions" USING btree ("recipe_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_product" ON "recipes" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_output" ON "recipes" USING btree ("output_ingredient_id");