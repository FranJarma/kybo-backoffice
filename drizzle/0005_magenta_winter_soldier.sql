CREATE TABLE "preparation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"assignee_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preparation_event_action" CHECK ("preparation_events"."action" in ('queued','start','ready','deliver','reassign','cancel'))
);
--> statement-breakpoint
CREATE TABLE "preparation_routes" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"station_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preparation_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preparation_task_lines" (
	"task_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	CONSTRAINT "preparation_task_lines_task_id_line_id_pk" PRIMARY KEY("task_id","line_id")
);
--> statement-breakpoint
CREATE TABLE "preparation_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"station_id" uuid,
	"station_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"assignee_id" text,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "preparation_task_state" CHECK ("preparation_tasks"."status" in ('pending','preparing','ready','delivered','cancelled')),
	CONSTRAINT "preparation_task_progress" CHECK (("preparation_tasks"."status" not in ('preparing','ready','delivered') or ("preparation_tasks"."started_at" is not null and "preparation_tasks"."assignee_id" is not null)) and ("preparation_tasks"."status" not in ('ready','delivered') or "preparation_tasks"."ready_at" is not null) and ("preparation_tasks"."status" <> 'delivered' or "preparation_tasks"."delivered_at" is not null) and ("preparation_tasks"."status" <> 'cancelled' or "preparation_tasks"."cancelled_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "preparation_events" ADD CONSTRAINT "preparation_events_task_id_preparation_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."preparation_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_events" ADD CONSTRAINT "preparation_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_events" ADD CONSTRAINT "preparation_events_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_routes" ADD CONSTRAINT "preparation_routes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_routes" ADD CONSTRAINT "preparation_routes_station_id_preparation_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."preparation_stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_task_lines" ADD CONSTRAINT "preparation_task_lines_task_id_preparation_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."preparation_tasks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_task_lines" ADD CONSTRAINT "preparation_task_lines_line_id_sale_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."sale_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_tasks" ADD CONSTRAINT "preparation_tasks_order_id_sale_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sale_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_tasks" ADD CONSTRAINT "preparation_tasks_station_id_preparation_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."preparation_stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_tasks" ADD CONSTRAINT "preparation_tasks_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "preparation_event_revision" ON "preparation_events" USING btree ("task_id","revision");--> statement-breakpoint
CREATE INDEX "preparation_route_station" ON "preparation_routes" USING btree ("station_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preparation_station_name" ON "preparation_stations" USING btree (lower("name")) WHERE "preparation_stations"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "preparation_line_once" ON "preparation_task_lines" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "preparation_active_queue" ON "preparation_tasks" USING btree ("status","enqueued_at","id");--> statement-breakpoint
CREATE INDEX "preparation_order" ON "preparation_tasks" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "preparation_assignee" ON "preparation_tasks" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "preparation_order_station" ON "preparation_tasks" USING btree ("order_id","station_id") WHERE "preparation_tasks"."station_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "preparation_order_general" ON "preparation_tasks" USING btree ("order_id") WHERE "preparation_tasks"."station_id" is null;