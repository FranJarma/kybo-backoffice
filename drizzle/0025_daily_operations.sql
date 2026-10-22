CREATE TABLE daily_operation_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id),
 kind text NOT NULL CHECK (kind IN ('transfer','production','purchase','count')),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','in_progress','blocked','awaiting_review','done','cancelled','superseded')),
 urgency text NOT NULL DEFAULT 'scheduled' CHECK (urgency IN ('critical','high','scheduled')),
 title text NOT NULL, reason text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 need_key text, document_id uuid, document_role text NOT NULL DEFAULT 'execute', document_revision integer,
 item_id uuid REFERENCES items(id), quantity numeric(18,6) CHECK(quantity>0), unit text,
 location_id uuid, origin_location_id uuid, assigned_to text REFERENCES "user"(id), due_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,branch_id), FOREIGN KEY(location_id,branch_id) REFERENCES locations(id,branch_id),
 FOREIGN KEY(origin_location_id,branch_id) REFERENCES locations(id,branch_id)
);
CREATE UNIQUE INDEX daily_operation_need ON daily_operation_tasks(branch_id,need_key) WHERE need_key IS NOT NULL AND state NOT IN ('done','cancelled','superseded');
CREATE UNIQUE INDEX daily_operation_document ON daily_operation_tasks(branch_id,kind,document_id,document_role) WHERE document_id IS NOT NULL;
CREATE INDEX daily_operation_queue ON daily_operation_tasks(branch_id,state,due_at);
CREATE INDEX daily_operation_assignee ON daily_operation_tasks(branch_id,assigned_to,state);
CREATE TABLE daily_operation_task_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES branches(id), task_id uuid NOT NULL,
 revision integer NOT NULL, action text NOT NULL, actor_id text NOT NULL REFERENCES "user"(id), reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(task_id,revision), FOREIGN KEY(task_id,branch_id) REFERENCES daily_operation_tasks(id,branch_id)
);
CREATE TABLE daily_operation_task_dependencies (
 branch_id uuid NOT NULL REFERENCES branches(id), task_id uuid NOT NULL, depends_on_id uuid NOT NULL,
 PRIMARY KEY(task_id,depends_on_id), CHECK(task_id<>depends_on_id),
 FOREIGN KEY(task_id,branch_id) REFERENCES daily_operation_tasks(id,branch_id),
 FOREIGN KEY(depends_on_id,branch_id) REFERENCES daily_operation_tasks(id,branch_id)
);
CREATE TABLE daily_operation_branch_settings (
 branch_id uuid PRIMARY KEY REFERENCES branches(id), revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
