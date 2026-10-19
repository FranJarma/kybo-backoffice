ALTER TABLE products ADD COLUMN kind text NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual','combo'));
CREATE TABLE combo_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id), revision integer NOT NULL CHECK(revision>0), actor_id text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT combo_product_revision UNIQUE(product_id,revision));
CREATE TABLE combo_groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version_id uuid NOT NULL REFERENCES combo_versions(id), name text NOT NULL, position integer NOT NULL CHECK(position>=0), quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 99), UNIQUE(version_id,position));
CREATE TABLE combo_options (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid NOT NULL REFERENCES combo_groups(id), product_id uuid NOT NULL REFERENCES products(id), position integer NOT NULL CHECK(position>=0), counter numeric(14,2) NOT NULL DEFAULT 0 CHECK(counter>=0), pedidosya numeric(14,2) NOT NULL DEFAULT 0 CHECK(pedidosya>=0), ubereats numeric(14,2) NOT NULL DEFAULT 0 CHECK(ubereats>=0), CONSTRAINT combo_option_product UNIQUE(group_id,product_id));
ALTER TABLE sale_lines ADD COLUMN line_kind text NOT NULL DEFAULT 'individual', ADD COLUMN combo_version_id uuid REFERENCES combo_versions(id), ADD COLUMN parent_line_id uuid REFERENCES sale_lines(id), ADD COLUMN combo_group_id uuid REFERENCES combo_groups(id), ADD COLUMN combo_option_id uuid REFERENCES combo_options(id);
ALTER TABLE sale_lines ADD CONSTRAINT sale_line_combo_shape CHECK (
 (line_kind='individual' AND combo_version_id IS NULL AND parent_line_id IS NULL AND combo_group_id IS NULL AND combo_option_id IS NULL) OR
 (line_kind='combo' AND combo_version_id IS NOT NULL AND parent_line_id IS NULL AND combo_group_id IS NULL AND combo_option_id IS NULL AND recipe_version_id IS NULL AND fulfillment_version_id IS NULL) OR
 (line_kind='combo_component' AND parent_line_id IS NOT NULL AND combo_version_id IS NOT NULL AND combo_group_id IS NOT NULL AND combo_option_id IS NOT NULL AND unit_price=0 AND line_total=0 AND fulfillment_version_id IS NOT NULL));
CREATE INDEX sale_line_combo_parent ON sale_lines(parent_line_id);
CREATE FUNCTION kybo_validate_combo_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.line_kind='combo' AND NOT EXISTS(SELECT 1 FROM combo_versions v WHERE v.id=NEW.combo_version_id AND v.product_id=NEW.product_id) THEN RAISE EXCEPTION 'Invalid combo version owner'; END IF;
 IF NEW.line_kind='combo_component' AND NOT EXISTS(SELECT 1 FROM sale_lines p JOIN combo_groups g ON g.version_id=p.combo_version_id JOIN combo_options o ON o.group_id=g.id WHERE p.id=NEW.parent_line_id AND p.line_kind='combo' AND p.order_id=NEW.order_id AND p.branch_id=NEW.branch_id AND p.combo_version_id=NEW.combo_version_id AND g.id=NEW.combo_group_id AND o.id=NEW.combo_option_id AND o.product_id=NEW.product_id AND NEW.quantity=p.quantity*g.quantity) THEN RAISE EXCEPTION 'Invalid combo component owner'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sale_line_combo_owner BEFORE INSERT OR UPDATE ON sale_lines FOR EACH ROW EXECUTE FUNCTION kybo_validate_combo_line();
CREATE FUNCTION kybo_combo_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Published combo definitions are immutable'; END $$;
CREATE TRIGGER combo_version_immutable BEFORE UPDATE OR DELETE ON combo_versions FOR EACH ROW EXECUTE FUNCTION kybo_combo_immutable();
CREATE TRIGGER combo_group_immutable BEFORE UPDATE OR DELETE ON combo_groups FOR EACH ROW EXECUTE FUNCTION kybo_combo_immutable();
CREATE TRIGGER combo_option_immutable BEFORE UPDATE OR DELETE ON combo_options FOR EACH ROW EXECUTE FUNCTION kybo_combo_immutable();
