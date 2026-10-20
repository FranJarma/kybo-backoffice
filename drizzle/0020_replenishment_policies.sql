CREATE TABLE "replenishment_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "location_id" uuid NOT NULL,
  "item_id" uuid NOT NULL REFERENCES "items"("id"),
  "minimum_quantity" numeric(18,6) NOT NULL,
  "target_quantity" numeric(18,6) NOT NULL,
  "preparation_minutes" integer,
  "enabled" boolean DEFAULT true NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "updated_by" text NOT NULL REFERENCES "user"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "replenishment_location_branch" FOREIGN KEY ("location_id", "branch_id") REFERENCES "locations"("id", "branch_id"),
  CONSTRAINT "replenishment_quantities" CHECK ("minimum_quantity" >= 0 AND "target_quantity" > 0 AND "target_quantity" >= "minimum_quantity" AND (NOT "enabled" OR "target_quantity" > "minimum_quantity")),
  CONSTRAINT "replenishment_minutes" CHECK ("preparation_minutes" IS NULL OR "preparation_minutes" BETWEEN 1 AND 10080),
  CONSTRAINT "replenishment_revision" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "replenishment_location_item" ON "replenishment_policies" ("branch_id", "location_id", "item_id");
