-- Shared store access, personal QR attempts and invitations. No accounts or operational data are created.

CREATE TABLE workplace_store_accounts (
 user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE RESTRICT,
 branch_id uuid NOT NULL REFERENCES branches(id),
 enabled boolean NOT NULL DEFAULT true,
 created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workplace_management_authorizations (
 id uuid PRIMARY KEY, token_hash text NOT NULL UNIQUE,
 session_id text NOT NULL REFERENCES session(id) ON DELETE CASCADE,
 store_user_id text NOT NULL REFERENCES "user"(id), manager_user_id text NOT NULL REFERENCES "user"(id),
 branch_id uuid NOT NULL REFERENCES branches(id), credential_version text NOT NULL,
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 saved_request_id uuid, saved_fingerprint text, saved_result jsonb,
 CONSTRAINT workplace_authorization_lifetime CHECK(expires_at>created_at AND expires_at<=created_at+interval '10 minutes')
);
CREATE INDEX workplace_authorization_session ON workplace_management_authorizations(session_id);
CREATE INDEX workplace_authorization_manager ON workplace_management_authorizations(manager_user_id);
CREATE TABLE workplace_management_limits (
 store_user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, session_id text NOT NULL,
 failures integer NOT NULL DEFAULT 0, window_at timestamptz NOT NULL, blocked_until timestamptz
);
CREATE TABLE workplace_plans (
 branch_id uuid NOT NULL REFERENCES branches(id), business_date text NOT NULL,
 revision integer NOT NULL DEFAULT 0, updated_by text NOT NULL REFERENCES "user"(id),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(branch_id,business_date)
);
CREATE TABLE workplace_station_assignments (
 assignment_id uuid PRIMARY KEY REFERENCES attendance_assignments(id),
 branch_id uuid NOT NULL REFERENCES branches(id), station_id uuid,
 updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(station_id,branch_id) REFERENCES preparation_stations(id,branch_id)
);
CREATE INDEX workplace_station_branch ON workplace_station_assignments(branch_id,station_id);

--> statement-breakpoint

CREATE TABLE attendance_qr_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
 user_id text NOT NULL REFERENCES "user"(id),
 session_id text NOT NULL REFERENCES "session"(id) ON DELETE CASCADE,
 branch_id uuid NOT NULL REFERENCES branches(id), settings_revision integer NOT NULL,
 fingerprint text NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 consumed_at timestamptz, operation_request_id uuid,
 CONSTRAINT attendance_qr_attempt_lifetime CHECK (expires_at>created_at AND expires_at<=created_at+interval '2 minutes' AND settings_revision>0)
);
CREATE INDEX attendance_qr_attempt_user ON attendance_qr_attempts(user_id,created_at);

--> statement-breakpoint

CREATE TABLE user_invitations (
 user_id text PRIMARY KEY REFERENCES "user"(id), token_hash text NOT NULL UNIQUE,
 generation uuid NOT NULL, branch_id uuid NOT NULL REFERENCES branches(id),
 expires_at timestamptz NOT NULL, activated_at timestamptz,
 message_ciphertext text, created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_invitations_expiry ON user_invitations(expires_at);
CREATE TABLE invitation_requests (
 request_id uuid PRIMARY KEY, actor_id text NOT NULL REFERENCES "user"(id),
 user_id text NOT NULL REFERENCES "user"(id), generation uuid NOT NULL,
 fingerprint text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity_enrollment_grants (
 session_id text PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id), branch_id uuid NOT NULL REFERENCES branches(id),
 expires_at timestamptz NOT NULL, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
