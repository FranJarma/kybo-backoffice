CREATE TABLE product_option_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_option_group_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid NOT NULL REFERENCES product_option_groups(id),
 version integer NOT NULL CHECK(version>0), name text NOT NULL, actor_id text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT product_option_group_number UNIQUE(group_id,version),
 CONSTRAINT product_option_group_owner UNIQUE(id,group_id)
);
CREATE TABLE product_option_group_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES product_option_group_versions(id),
 product_id uuid NOT NULL REFERENCES products(id), position integer NOT NULL CHECK(position>=0),
 CONSTRAINT product_option_group_product_once UNIQUE(version_id,product_id),
 CONSTRAINT product_option_group_position_once UNIQUE(version_id,position)
);
ALTER TABLE combo_groups ADD COLUMN source_group_id uuid REFERENCES product_option_groups(id), ADD COLUMN source_group_version_id uuid;
ALTER TABLE combo_groups ADD CONSTRAINT combo_group_source_pair CHECK ((source_group_id IS NULL) = (source_group_version_id IS NULL));
ALTER TABLE combo_groups ADD CONSTRAINT combo_group_source_owner FOREIGN KEY(source_group_version_id,source_group_id) REFERENCES product_option_group_versions(id,group_id);
CREATE UNIQUE INDEX combo_shared_group_once ON combo_groups(version_id,source_group_id);
CREATE TRIGGER product_option_group_version_immutable BEFORE UPDATE OR DELETE ON product_option_group_versions FOR EACH ROW EXECUTE FUNCTION kybo_combo_immutable();
CREATE TRIGGER product_option_group_products_immutable BEFORE UPDATE OR DELETE ON product_option_group_products FOR EACH ROW EXECUTE FUNCTION kybo_combo_immutable();
