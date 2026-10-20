CREATE TABLE expense_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id),
 month date NOT NULL CHECK (extract(day from month) = 1), expected_units integer CHECK (expected_units BETWEEN 1 AND 1000000000),
 entries jsonb NOT NULL CHECK (jsonb_typeof(entries) = 'array'), revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','closed')),
 updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT expense_period_branch_month UNIQUE(branch_id,month)
);
--> statement-breakpoint
CREATE TABLE expense_closures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_id uuid NOT NULL REFERENCES expense_periods(id),
 sequence integer NOT NULL CHECK(sequence > 0), entries jsonb NOT NULL CHECK (jsonb_typeof(entries) = 'array'),
 expected_units integer CHECK (expected_units BETWEEN 1 AND 1000000000), actual_units integer NOT NULL CHECK(actual_units >= 0),
 reason text NOT NULL, actor_id text NOT NULL REFERENCES "user"(id), closed_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT expense_close_sequence UNIQUE(period_id,sequence)
);
--> statement-breakpoint
CREATE FUNCTION kybo_expense_close_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Expense closures are immutable; create an audited revision'; END $$;
--> statement-breakpoint
CREATE TRIGGER expense_close_immutable BEFORE UPDATE OR DELETE ON expense_closures FOR EACH ROW EXECUTE FUNCTION kybo_expense_close_immutable();
