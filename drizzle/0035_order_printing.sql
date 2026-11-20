CREATE TABLE printing_settings (
 branch_id uuid PRIMARY KEY REFERENCES branches(id), enabled boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1, printer_name text NOT NULL, updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE printing_connectors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), token_hash text NOT NULL,
 name text NOT NULL, printer_name text NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz,
 instance_id uuid, printer_status text NOT NULL DEFAULT 'unknown', printer_message text,
 UNIQUE(id,branch_id), UNIQUE(token_hash)
);
CREATE UNIQUE INDEX printing_connector_active ON printing_connectors(branch_id) WHERE revoked_at IS NULL;
CREATE TABLE printing_pairings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), code_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, used_at timestamptz, created_by text NOT NULL REFERENCES "user"(id)
);
CREATE TABLE print_tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), order_id uuid,
 station_key text NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,station_key), UNIQUE(id,branch_id), FOREIGN KEY(order_id,branch_id) REFERENCES sale_orders(id,branch_id)
);
CREATE TABLE print_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), ticket_id uuid NOT NULL, settings_revision integer NOT NULL DEFAULT 1,
 kind text NOT NULL CHECK(kind IN ('original','copy','historical','cancellation','change','test')),
 copy_number integer NOT NULL DEFAULT 0, event_key text NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','sending','sent','error','uncertain','review','cancelled')),
 requested_by text NOT NULL REFERENCES "user"(id), reason text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 connector_id uuid, lease_token text, lease_expires_at timestamptz, instance_id uuid, spool_job_id integer, spool_state text NOT NULL DEFAULT 'unknown', error text, change text, reviewed_at timestamptz, report_outcome text,
 UNIQUE(branch_id,event_key), FOREIGN KEY(ticket_id,branch_id) REFERENCES print_tickets(id,branch_id), FOREIGN KEY(connector_id,branch_id) REFERENCES printing_connectors(id,branch_id)
);
CREATE INDEX print_dispatch_queue ON print_jobs(branch_id,state,created_at);
CREATE TABLE printing_requests (
 request_id uuid PRIMARY KEY, branch_id uuid NOT NULL REFERENCES branches(id), actor_id text NOT NULL REFERENCES "user"(id), fingerprint text NOT NULL, result jsonb NOT NULL
);
