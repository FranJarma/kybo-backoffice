ALTER TABLE production_orders DROP CONSTRAINT production_order_state;
ALTER TABLE production_orders ADD CONSTRAINT production_order_state CHECK (state IN ('planned','confirmed','completed','cancelled'));
ALTER TABLE production_orders
  ADD COLUMN assigned_to text REFERENCES "user"(id),
  ADD COLUMN created_by text REFERENCES "user"(id),
  ADD COLUMN started_by text REFERENCES "user"(id),
  ADD COLUMN completed_by text REFERENCES "user"(id),
  ADD COLUMN created_at timestamptz,
  ADD COLUMN scheduled_for timestamptz,
  ADD COLUMN started_at timestamptz,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN notes text;
-- Existing orders keep unknown actors/times as NULL; only new orders get now().
ALTER TABLE production_orders ALTER COLUMN created_at SET DEFAULT now();
CREATE INDEX production_order_tasks ON production_orders(branch_id, assigned_to, state, scheduled_for);
