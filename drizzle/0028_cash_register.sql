CREATE TABLE cash_settings (
 branch_id uuid PRIMARY KEY REFERENCES branches(id), close_time text NOT NULL DEFAULT '23:00', target_fund numeric(14,2), activated_at timestamptz, revision integer NOT NULL DEFAULT 1, updated_by text REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT cash_settings_time CHECK (close_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'), CONSTRAINT cash_settings_fund CHECK (target_fund IS NULL OR target_fund>=0)
);
CREATE TABLE cash_permissions (
 branch_id uuid NOT NULL REFERENCES branches(id), user_id text NOT NULL REFERENCES "user"(id), can_open boolean NOT NULL DEFAULT false, can_close boolean NOT NULL DEFAULT false, can_expense boolean NOT NULL DEFAULT false, updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(branch_id,user_id)
);
CREATE TABLE cash_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), business_date date NOT NULL, state text NOT NULL DEFAULT 'open', opening_cash numeric(14,2) NOT NULL, opening_reason text NOT NULL DEFAULT '', close_time text NOT NULL, target_fund numeric(14,2), time_zone text NOT NULL, opened_by text NOT NULL REFERENCES "user"(id), opened_at timestamptz NOT NULL DEFAULT now(), revision integer NOT NULL DEFAULT 1,
 closed_at timestamptz, closed_by text REFERENCES "user"(id), expected_closing numeric(14,2), counted numeric(14,2), withdrawal numeric(14,2), fund numeric(14,2), difference numeric(14,2), reason text, posnet jsonb, review_required boolean NOT NULL DEFAULT false, reviewed_at timestamptz, reviewed_by text REFERENCES "user"(id), review_note text,
 CONSTRAINT cash_session_state CHECK(state IN ('open','closed')), CONSTRAINT cash_session_money CHECK(opening_cash>=0 AND (target_fund IS NULL OR target_fund>=0)),
 CONSTRAINT cash_closed_values CHECK(state='open' OR (closed_at IS NOT NULL AND closed_by IS NOT NULL AND expected_closing IS NOT NULL AND counted IS NOT NULL AND withdrawal IS NOT NULL AND fund IS NOT NULL AND difference IS NOT NULL AND counted>=0 AND withdrawal>=0 AND withdrawal<=counted AND fund=counted-withdrawal AND difference=counted-expected_closing AND posnet IS NOT NULL))
);
CREATE UNIQUE INDEX cash_session_branch ON cash_sessions(id,branch_id);
CREATE UNIQUE INDEX cash_one_open ON cash_sessions(branch_id) WHERE state='open';
CREATE INDEX cash_session_history ON cash_sessions(branch_id,opened_at);
CREATE TABLE cash_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL, branch_id uuid NOT NULL, kind text NOT NULL, amount numeric(14,2) NOT NULL, method_kind text NOT NULL, method_name text NOT NULL, concept text NOT NULL, reference text, source_type text NOT NULL, source_id uuid NOT NULL, actor_id text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(session_id,branch_id) REFERENCES cash_sessions(id,branch_id), CONSTRAINT cash_movement_kind CHECK(kind IN ('opening','collection','refund','expense','withdrawal','supplier','advance'))
);
CREATE UNIQUE INDEX cash_movement_source ON cash_movements(source_type,source_id);
CREATE INDEX cash_movement_session ON cash_movements(session_id,created_at);
CREATE TABLE cash_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL, session_id uuid NOT NULL, business_date date NOT NULL, category text NOT NULL, concept text NOT NULL, amount numeric(14,2) NOT NULL, source text NOT NULL, actor_id text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(session_id,branch_id) REFERENCES cash_sessions(id,branch_id), CONSTRAINT cash_expense_positive CHECK(amount>0), CONSTRAINT cash_expense_source CHECK(source IN ('cash','external'))
);
CREATE INDEX cash_expense_month ON cash_expenses(branch_id,business_date);
CREATE TABLE cash_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL, session_id uuid NOT NULL, creator_id text NOT NULL REFERENCES "user"(id), storage_key text NOT NULL UNIQUE, width integer NOT NULL, height integer NOT NULL, bytes integer NOT NULL, claimed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(session_id,branch_id) REFERENCES cash_sessions(id,branch_id)
);
CREATE INDEX cash_photo_session ON cash_photos(session_id);
ALTER TABLE cash_sessions ADD COLUMN posnet_review jsonb;
