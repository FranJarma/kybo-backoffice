ALTER TABLE branches ADD COLUMN locator_count integer NOT NULL DEFAULT 16;
ALTER TABLE branches ADD COLUMN public_queue_key uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE branches ADD CONSTRAINT branch_locator_count CHECK (locator_count BETWEEN 1 AND 999);
CREATE UNIQUE INDEX branch_public_queue_key ON branches(public_queue_key);
--> statement-breakpoint
CREATE TABLE locator_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  order_id uuid NOT NULL,
  number integer NOT NULL,
  assigned_by text NOT NULL REFERENCES "user"(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  returned_by text REFERENCES "user"(id),
  returned_at timestamptz,
  FOREIGN KEY(order_id, branch_id) REFERENCES sale_orders(id, branch_id),
  CONSTRAINT locator_positive CHECK(number > 0),
  CONSTRAINT locator_return_pair CHECK (
    (returned_at IS NULL AND returned_by IS NULL) OR
    (returned_at IS NOT NULL AND returned_by IS NOT NULL AND returned_at >= assigned_at)
  )
);
CREATE UNIQUE INDEX locator_number_occupied ON locator_assignments(branch_id, number) WHERE returned_at IS NULL;
CREATE UNIQUE INDEX locator_order_occupied ON locator_assignments(order_id) WHERE returned_at IS NULL;
CREATE INDEX locator_order_history ON locator_assignments(order_id, assigned_at);
CREATE INDEX pickup_branch_orders ON sale_orders(branch_id, created_at, id);
CREATE INDEX pickup_active_fulfillments ON sale_line_fulfillments(branch_id, sale_line_id) WHERE delivered + cancelled < ordered;
CREATE INDEX pickup_active_tasks ON preparation_tasks(branch_id, order_id) WHERE status IN ('pending','preparing','ready');
