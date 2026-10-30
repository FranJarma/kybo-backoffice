-- Additive only. No branch activation, real attendance, credentials or stock changes.
CREATE TABLE identity_credentials (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id), rp_id text NOT NULL, public_key text NOT NULL,
 counter bigint NOT NULL DEFAULT 0 CHECK(counter>=0), transports jsonb NOT NULL DEFAULT '[]',
 device_type text NOT NULL, backed_up boolean NOT NULL, name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz, revoked_at timestamptz, revoked_by text REFERENCES "user"(id)
);
CREATE INDEX identity_credentials_user ON identity_credentials(user_id);
CREATE TABLE identity_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES "user"(id),
 branch_id uuid NOT NULL REFERENCES branches(id), kind text NOT NULL CHECK(kind IN ('registration','verification')),
 challenge text NOT NULL, rp_id text NOT NULL, origin text NOT NULL, binding jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE INDEX identity_challenge_expiry ON identity_challenges(user_id,expires_at);
CREATE TABLE identity_confirmations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES "user"(id),
 branch_id uuid NOT NULL REFERENCES branches(id), credential_id text NOT NULL REFERENCES identity_credentials(id),
 action text NOT NULL, request_id uuid NOT NULL, payload_hash text NOT NULL, verified_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL, consumed_at timestamptz, operation_id uuid
);
CREATE INDEX identity_confirmation_expiry ON identity_confirmations(user_id,expires_at);
CREATE TABLE identity_enrollment_limits (
 user_id text PRIMARY KEY REFERENCES "user"(id), failures bigint NOT NULL DEFAULT 0,
 window_at timestamptz NOT NULL, blocked_until timestamptz
);
CREATE TABLE attendance_settings (
 branch_id uuid PRIMARY KEY REFERENCES branches(id), enabled boolean NOT NULL DEFAULT false,
 latitude double precision, longitude double precision, radius_meters integer NOT NULL DEFAULT 100,
 max_accuracy_meters integer NOT NULL DEFAULT 40, code_validity_minutes integer NOT NULL DEFAULT 10,
 require_step_up boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1,
 updated_by text REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT attendance_policy_values CHECK(radius_meters BETWEEN 1 AND 10000 AND max_accuracy_meters BETWEEN 1 AND 1000 AND code_validity_minutes BETWEEN 1 AND 1440 AND revision>0),
 CONSTRAINT attendance_coordinates CHECK((latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)),
 CONSTRAINT attendance_enabled_location CHECK(NOT enabled OR (latitude IS NOT NULL AND longitude IS NOT NULL AND max_accuracy_meters<=radius_meters))
);
CREATE TABLE attendance_participants (
 branch_id uuid NOT NULL REFERENCES branches(id), user_id text NOT NULL REFERENCES "user"(id),
 enabled boolean NOT NULL DEFAULT false, updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(branch_id,user_id)
);
CREATE TABLE attendance_shifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id),
 name text NOT NULL, start text NOT NULL, "end" text NOT NULL, overnight boolean NOT NULL DEFAULT false,
 pause_minutes integer NOT NULL DEFAULT 30 CHECK(pause_minutes>=0 AND pause_minutes<1440),
 active boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1, updated_by text NOT NULL REFERENCES "user"(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_shift_branch ON attendance_shifts(branch_id);
CREATE TABLE attendance_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), user_id text NOT NULL REFERENCES "user"(id),
 business_date date NOT NULL, kind text NOT NULL, shift_id uuid REFERENCES attendance_shifts(id), name text NOT NULL,
 starts_at timestamptz, ends_at timestamptz, pause_minutes integer NOT NULL DEFAULT 0, time_zone text NOT NULL,
 revision integer NOT NULL DEFAULT 1, reason text NOT NULL DEFAULT '', canceled_at timestamptz,
 updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT attendance_assignment_window CHECK(
  (kind='off' AND starts_at IS NULL AND ends_at IS NULL AND pause_minutes=0) OR
  (kind='work' AND starts_at IS NOT NULL AND ends_at>starts_at AND ends_at<starts_at+interval '24 hours'
   AND pause_minutes>=0 AND pause_minutes*interval '1 minute'<ends_at-starts_at))
);
CREATE INDEX attendance_assignment_lookup ON attendance_assignments(branch_id,business_date,user_id);
CREATE UNIQUE INDEX attendance_assignment_start ON attendance_assignments(user_id,starts_at) WHERE canceled_at IS NULL AND kind='work';
CREATE UNIQUE INDEX attendance_one_off ON attendance_assignments(branch_id,user_id,business_date) WHERE canceled_at IS NULL AND kind='off';
CREATE TABLE attendance_manual_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), user_id text NOT NULL REFERENCES "user"(id),
 kind text NOT NULL CHECK(kind IN ('entry','pause','resume','exit')), occurred_at timestamptz NOT NULL,
 assignment_id uuid REFERENCES attendance_assignments(id), reason text NOT NULL, requested_by text NOT NULL REFERENCES "user"(id),
 requested_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'pending',
 approved_by text REFERENCES "user"(id), decided_at timestamptz, decision_reason text, validity_minutes integer,
 expires_at timestamptz, code_hash text, code_cipher text, failed_attempts integer NOT NULL DEFAULT 0,
 used_at timestamptz, used_by text REFERENCES "user"(id),
 CONSTRAINT attendance_manual_state CHECK(status IN ('pending','approved','rejected','used','locked') AND failed_attempts BETWEEN 0 AND 5),
 CONSTRAINT attendance_manual_separate_approval CHECK(approved_by IS NULL OR approved_by<>requested_by),
 CONSTRAINT attendance_manual_approved_code CHECK(status<>'approved' OR (approved_by IS NOT NULL AND decided_at IS NOT NULL AND expires_at>decided_at AND validity_minutes>0 AND code_hash IS NOT NULL AND code_cipher IS NOT NULL))
);
CREATE INDEX attendance_manual_branch ON attendance_manual_requests(branch_id,requested_at);
CREATE TABLE attendance_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sequence bigserial NOT NULL,
 branch_id uuid NOT NULL REFERENCES branches(id), user_id text NOT NULL REFERENCES "user"(id),
 kind text NOT NULL CHECK(kind IN ('entry','pause','resume','exit')),
 occurred_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(), business_date date NOT NULL,
 source text NOT NULL, assignment_id uuid REFERENCES attendance_assignments(id), credential_id text REFERENCES identity_credentials(id),
 manual_request_id uuid REFERENCES attendance_manual_requests(id), evidence jsonb, recorded_by text NOT NULL REFERENCES "user"(id),
 CONSTRAINT attendance_event_evidence CHECK(
  (source='phone' AND credential_id IS NOT NULL AND evidence IS NOT NULL AND manual_request_id IS NULL) OR
  (source='manual' AND manual_request_id IS NOT NULL AND credential_id IS NULL AND evidence IS NULL))
);
CREATE INDEX attendance_event_user ON attendance_events(user_id,occurred_at,sequence);
CREATE INDEX attendance_event_branch ON attendance_events(branch_id,business_date);
CREATE FUNCTION attendance_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Los fichajes originales son inmutables; registrá una corrección auditada.'; END;
$$;
CREATE TRIGGER attendance_events_no_mutation BEFORE UPDATE OR DELETE ON attendance_events FOR EACH ROW EXECUTE FUNCTION attendance_events_immutable();
CREATE TABLE attendance_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), user_id text NOT NULL REFERENCES "user"(id),
 changes jsonb NOT NULL, original_hash text NOT NULL, reason text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 requested_by text NOT NULL REFERENCES "user"(id), requested_at timestamptz NOT NULL DEFAULT now(),
 resolved_by text REFERENCES "user"(id), resolved_at timestamptz, resolution_reason text
);
CREATE INDEX attendance_correction_user ON attendance_corrections(user_id,resolved_at);
CREATE TABLE attendance_operations (
 request_id uuid PRIMARY KEY, actor_id text NOT NULL REFERENCES "user"(id), branch_id uuid NOT NULL REFERENCES branches(id),
 fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE attendance_event_links (
 entry_id uuid PRIMARY KEY REFERENCES attendance_events(id), assignment_id uuid NOT NULL REFERENCES attendance_assignments(id),
 reason text NOT NULL, linked_by text NOT NULL REFERENCES "user"(id), linked_at timestamptz NOT NULL DEFAULT now()
);
