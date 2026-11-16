CREATE TABLE "password_recovery_contacts" (
  "user_id" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "phone" text UNIQUE,
  "enabled" boolean NOT NULL DEFAULT false,
  "version" uuid NOT NULL DEFAULT gen_random_uuid(),
  "confirmed_at" timestamptz,
  "updated_by" text NOT NULL REFERENCES "user"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recovery_phone_format" CHECK ("phone" IS NULL OR "phone" ~ '^[+][1-9][0-9]{7,14}$'),
  CONSTRAINT "recovery_contact_enabled" CHECK (NOT "enabled" OR ("phone" IS NOT NULL AND "confirmed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "password_recovery_challenges" (
  "id" uuid PRIMARY KEY,
  "user_id" text REFERENCES "user"("id") ON DELETE CASCADE,
  "contact_version" uuid,
  "subject_version" text,
  "code_digest" text NOT NULL,
  "grant_digest" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "state" text NOT NULL DEFAULT 'queued',
  "created_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "grant_expires_at" timestamptz,
  CONSTRAINT "recovery_challenge_attempts" CHECK ("attempts" BETWEEN 0 AND 5),
  CONSTRAINT "recovery_challenge_state" CHECK ("state" IN ('queued','sending','sent','failed','verified','consumed','invalid'))
);
--> statement-breakpoint
CREATE INDEX "recovery_challenge_user_created" ON "password_recovery_challenges"("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "recovery_challenge_expiry" ON "password_recovery_challenges"("expires_at");
--> statement-breakpoint
CREATE INDEX "recovery_challenge_created" ON "password_recovery_challenges"("created_at");
--> statement-breakpoint
CREATE TABLE "password_recovery_limits" (
  "key" text PRIMARY KEY,
  "count" integer NOT NULL CHECK ("count">0),
  "window_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "recovery_limit_expiry" ON "password_recovery_limits"("expires_at");
