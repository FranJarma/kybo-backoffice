CREATE UNIQUE INDEX purchase_order_financial_scope ON purchase_orders(id, branch_id, supplier_id);
--> statement-breakpoint
CREATE UNIQUE INDEX purchase_receipt_financial_scope ON purchase_receipts(id, branch_id, supplier_id);
--> statement-breakpoint
ALTER TABLE purchase_payments ADD COLUMN source text;
--> statement-breakpoint
ALTER TABLE purchase_payments ADD CONSTRAINT purchase_payment_source CHECK (source IS NULL OR source IN ('cash','external'));
--> statement-breakpoint
CREATE TABLE purchase_advances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 branch_id uuid NOT NULL REFERENCES branches(id),
 supplier_id uuid NOT NULL REFERENCES suppliers(id),
 order_id uuid NOT NULL,
 payment_method_id uuid NOT NULL REFERENCES payment_methods(id),
 payment_method_name text NOT NULL,
 method_kind text NOT NULL,
 source text NOT NULL,
 amount numeric(18,2) NOT NULL,
 applied_amount numeric(18,2) NOT NULL DEFAULT 0,
 paid_on date NOT NULL,
 reference text,
 actor_id text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT purchase_advance_order_scope FOREIGN KEY(order_id,branch_id,supplier_id) REFERENCES purchase_orders(id,branch_id,supplier_id),
 CONSTRAINT purchase_advance_scope UNIQUE(id,order_id,branch_id,supplier_id),
 CONSTRAINT purchase_advance_amounts CHECK (amount>0 AND applied_amount>=0 AND applied_amount<=amount),
 CONSTRAINT purchase_advance_source CHECK (source IN ('cash','external') AND (source<>'cash' OR method_kind='cash') AND method_kind IN ('cash','card','transfer','other'))
);
--> statement-breakpoint
CREATE INDEX purchase_advance_order ON purchase_advances(order_id,created_at);
--> statement-breakpoint
CREATE TABLE purchase_advance_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 advance_id uuid NOT NULL,
 receipt_id uuid NOT NULL,
 order_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 supplier_id uuid NOT NULL,
 amount numeric(18,2) NOT NULL,
 actor_id text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT purchase_advance_application_scope FOREIGN KEY(advance_id,order_id,branch_id,supplier_id) REFERENCES purchase_advances(id,order_id,branch_id,supplier_id),
 CONSTRAINT purchase_advance_application_receipt_scope FOREIGN KEY(receipt_id,branch_id,supplier_id) REFERENCES purchase_receipts(id,branch_id,supplier_id),
 CONSTRAINT purchase_advance_receipt_once UNIQUE(advance_id,receipt_id),
 CONSTRAINT purchase_advance_application_positive CHECK(amount>0)
);
--> statement-breakpoint
CREATE INDEX purchase_advance_application_receipt ON purchase_advance_applications(receipt_id);
