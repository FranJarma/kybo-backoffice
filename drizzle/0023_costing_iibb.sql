ALTER TABLE expense_periods ADD COLUMN iibb_rate numeric(5,2) CHECK (iibb_rate BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE expense_closures ADD COLUMN iibb_rate numeric(5,2) CHECK (iibb_rate BETWEEN 0 AND 100);
