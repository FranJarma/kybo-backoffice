CREATE TABLE purchase_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), supplier_id uuid NOT NULL REFERENCES suppliers(id), supplier_name text NOT NULL,
 state text NOT NULL DEFAULT 'draft', ordered_on date NOT NULL, expected_on date, notes text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1,
 actor_id text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT purchase_order_state CHECK (state IN ('draft','ordered','partially_received','received','cancelled')),
 CONSTRAINT purchase_order_dates CHECK (expected_on IS NULL OR expected_on >= ordered_on), CONSTRAINT purchase_order_revision CHECK (revision>0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX purchase_order_branch ON purchase_orders(id,branch_id);
CREATE INDEX purchase_order_queue ON purchase_orders(branch_id,state,expected_on);
--> statement-breakpoint
CREATE TABLE purchase_order_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES purchase_orders(id), position integer NOT NULL,
 item_id uuid NOT NULL REFERENCES items(id), item_name text NOT NULL, base_unit text NOT NULL,
 presentation_id uuid REFERENCES purchase_presentations(id), presentation_name text,
 conversion_factor numeric(18,6) NOT NULL, quantity numeric(18,6) NOT NULL, ordered_quantity numeric(18,6) NOT NULL,
 received_quantity numeric(18,6) NOT NULL DEFAULT 0, cancelled_quantity numeric(18,6) NOT NULL DEFAULT 0,
 CONSTRAINT purchase_order_line_quantities CHECK (quantity>0 AND conversion_factor>0 AND ordered_quantity>0 AND received_quantity>=0 AND cancelled_quantity>=0 AND received_quantity+cancelled_quantity<=ordered_quantity)
);
--> statement-breakpoint
CREATE UNIQUE INDEX purchase_order_line_identity ON purchase_order_lines(id,order_id);
CREATE UNIQUE INDEX purchase_order_line_position ON purchase_order_lines(order_id,position);
--> statement-breakpoint
CREATE TABLE purchase_order_receipt_allocations (
 receipt_line_id uuid PRIMARY KEY REFERENCES purchase_receipt_lines(id), order_id uuid NOT NULL, order_line_id uuid NOT NULL, quantity numeric(18,6) NOT NULL CHECK (quantity>0),
 FOREIGN KEY (order_line_id,order_id) REFERENCES purchase_order_lines(id,order_id)
);
CREATE INDEX purchase_order_receipt_order ON purchase_order_receipt_allocations(order_id);
