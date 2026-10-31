CREATE TABLE user_password_policies (
 user_id text PRIMARY KEY REFERENCES "user"(id),
 required boolean NOT NULL DEFAULT false,
 generation uuid NOT NULL DEFAULT gen_random_uuid(),
 credential_version text NOT NULL,
 issued_by text NOT NULL REFERENCES "user"(id),
 issued_at timestamptz NOT NULL DEFAULT now(),
 first_login_at timestamptz,
 expires_at timestamptz,
 completed_at timestamptz,
 failures integer NOT NULL DEFAULT 0,
 failure_window_at timestamptz,
 blocked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT password_policy_deadline CHECK (
  (first_login_at is null and expires_at is null) or
  (first_login_at is not null and expires_at is not null and expires_at=first_login_at+interval '24 hours')
 ),
 CONSTRAINT password_policy_failures CHECK(failures>=0),
 CONSTRAINT password_policy_completion CHECK(not required or completed_at is null)
);
