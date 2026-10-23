CREATE TABLE supply_alert_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  item_id uuid NOT NULL REFERENCES items(id),
  daily_consumption numeric(18,6),
  lead_days integer NOT NULL DEFAULT 7,
  safety_days integer NOT NULL DEFAULT 3,
  target_days integer NOT NULL DEFAULT 17,
  enabled boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1,
  updated_by text NOT NULL REFERENCES "user"(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supply_alert_consumption CHECK (daily_consumption IS NULL OR daily_consumption >= 0),
  CONSTRAINT supply_alert_days CHECK (lead_days BETWEEN 1 AND 364 AND safety_days BETWEEN 0 AND 364 AND target_days BETWEEN 1 AND 365 AND target_days > lead_days + safety_days),
  CONSTRAINT supply_alert_revision CHECK (revision > 0)
);
CREATE UNIQUE INDEX supply_alert_branch_item ON supply_alert_policies(branch_id,item_id);
