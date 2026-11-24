-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- rls.sql — database roles, RLS context, policies, guard triggers and SECURITY DEFINER helpers
-- Decision 9 (see DECISIONS-9-11.md §9 and permission-matrix.md).
--
-- Applied by the migrate container (owner connection, DATABASE_MIGRATE_URL) AFTER the Drizzle migration.
-- Everything above the line "STRETCH" belongs to the MVP; the stretch section is applied with the
-- stretch migrations. Tested on PostgreSQL 16 with the generated Drizzle DDL (tests/rls_tests.sql).
--
-- Layering: the domain layer (policy.can + scoped queries) is the FIRST line of authorization.
-- RLS is the SECOND line: it guarantees tenant isolation even if a query forgets a WHERE clause.
-- Status rules and role rules live mainly in the domain; RLS repeats the ones that are cheap to express.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ───────────── 0. Extensions ─────────────
CREATE EXTENSION IF NOT EXISTS ltree;       -- categories.path
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- products name fallback search
-- btree_gist is needed only by the S1 migration (buyer_prices exclusion constraint).

-- ───────────── 1. Roles ─────────────
-- horeca_owner : owns the tables, runs migrations (the DATABASE_MIGRATE_URL user). Bypasses RLS as owner.
-- horeca_app   : web process (DATABASE_URL). Not owner, NOBYPASSRLS → every policy applies.
-- horeca_worker: worker process only (DATABASE_WORKER_URL). System context for jobs that act for no user.
--                The web process never receives these credentials, so a web request cannot obtain
--                system access (decision 9.4). Jobs acting FOR a user (CSV import) use horeca_app + withTx(actor).
-- LOGIN + PASSWORD are set by ops on each server (never in git):  ALTER ROLE horeca_app LOGIN PASSWORD '…';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'horeca_app') THEN
    CREATE ROLE horeca_app NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'horeca_worker') THEN
    CREATE ROLE horeca_worker NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- ───────────── 2. Context ─────────────
-- withTx(actor) runs, as the first statements of every transaction:
--   SELECT set_config('app.user_id',  $userId,  true),
--          set_config('app.org_id',   $orgId,   true),
--          set_config('app.org_type', $orgType, true),   -- 'buyer' | 'supplier' | 'platform'
--          set_config('app.role',     $role,    true);   -- 'owner' | 'member'
-- `true` = local to the transaction, so a pooled connection never leaks a previous request's context.
-- No context → every helper returns NULL → every tenant policy is false → zero rows (fail closed).
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.user_id()  RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id',  true), '') $$;
CREATE OR REPLACE FUNCTION app.org_id()   RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id',   true), '') $$;
CREATE OR REPLACE FUNCTION app.org_type() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_type', true), '') $$;
CREATE OR REPLACE FUNCTION app.member_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.role', true), '') $$;
CREATE OR REPLACE FUNCTION app.is_platform() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(app.org_type() = 'platform' AND app.org_id() IS NOT NULL, false) $$;
CREATE OR REPLACE FUNCTION app.is_buyer()    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(app.org_type() = 'buyer'    AND app.org_id() IS NOT NULL, false) $$;
CREATE OR REPLACE FUNCTION app.is_supplier() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(app.org_type() = 'supplier' AND app.org_id() IS NOT NULL, false) $$;
CREATE OR REPLACE FUNCTION app.logged_in()   RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app.org_id() IS NOT NULL $$;

GRANT USAGE ON SCHEMA app TO horeca_app, horeca_worker;
GRANT USAGE ON SCHEMA public TO horeca_app, horeca_worker;

-- ───────────── 3. Table privileges (what each role may do at all; RLS then decides which rows) ─────────────
-- Better Auth tables: managed by the library, NO RLS (decision 3/9). The app layer protects them.
-- Grant on every Better Auth table the CLI creates (user, session, account, verification, organization,
-- member, invitation — verify the exact list in the generated schema).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user', 'session', 'account', 'verification', 'organization', 'member', 'invitation'] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO horeca_app', t);
      EXECUTE format('GRANT SELECT ON public.%I TO horeca_worker', t);
    END IF;
  END LOOP;
END $$;

-- Our tables. No DELETE except where the matrix deletes rows (cart lines, product images).
-- Append-only tables (ledger_entries, order_payments, audit_log, sub_order_events, order_lines) get no UPDATE/DELETE.
GRANT SELECT, INSERT, UPDATE         ON org_profiles, supplier_profiles, buyer_locations          TO horeca_app;
GRANT SELECT, INSERT, UPDATE         ON categories, category_attributes, settings                 TO horeca_app;
GRANT SELECT, INSERT, UPDATE         ON products, csv_imports, carts, sub_orders                  TO horeca_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_images, cart_items                                TO horeca_app;
GRANT SELECT, INSERT                 ON orders, order_lines, sub_order_events, proforma_invoices,
                                        order_payments, ledger_entries, audit_log                 TO horeca_app;
GRANT USAGE ON SEQUENCE order_number_seq TO horeca_app;
REVOKE ALL ON invoice_counters FROM horeca_app, horeca_worker;   -- only via app.next_invoice_number()

-- Worker: reads everything it needs; writes only the columns its jobs own.
GRANT SELECT ON org_profiles, supplier_profiles, buyer_locations, categories, category_attributes, settings,
                products, product_images, csv_imports, orders, sub_orders, order_lines, sub_order_events,
                proforma_invoices, order_payments, ledger_entries TO horeca_worker;
GRANT UPDATE (thumb_key, status, width, height) ON product_images TO horeca_worker;          -- thumbnail job
GRANT INSERT, UPDATE (status, storage_key, pdf_generated_at) ON proforma_invoices TO horeca_worker; -- PDF + re-issue
GRANT INSERT ON audit_log TO horeca_worker;

-- ───────────── 4. Enable RLS on every tenant / reference table ─────────────
-- (Not FORCE: the owner and the SECURITY DEFINER helpers below must bypass RLS by design.)
ALTER TABLE org_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_locations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images      ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_imports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_order_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE proforma_invoices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_counters    ENABLE ROW LEVEL SECURITY;   -- no policies at all = no direct access

-- Worker (system context) reads every row of the tables it was granted. One policy per table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['org_profiles', 'supplier_profiles', 'buyer_locations', 'categories', 'category_attributes',
    'settings', 'products', 'product_images', 'csv_imports', 'orders', 'sub_orders', 'order_lines', 'sub_order_events',
    'proforma_invoices', 'order_payments', 'ledger_entries'] LOOP
    EXECUTE format('CREATE POLICY worker_read ON %I FOR SELECT TO horeca_worker USING (true)', t);
  END LOOP;
END $$;

-- ───────────── 5. Identity extension ─────────────
-- org_profiles: own row; platform all; approved suppliers are visible to every logged-in org (catalogue, invoices).
CREATE POLICY org_profiles_read ON org_profiles FOR SELECT TO horeca_app USING (
  organization_id = app.org_id() OR app.is_platform()
  OR (app.logged_in() AND type = 'supplier' AND status = 'approved'));
CREATE POLICY org_profiles_insert ON org_profiles FOR INSERT TO horeca_app WITH CHECK (organization_id = app.org_id());
CREATE POLICY org_profiles_update ON org_profiles FOR UPDATE TO horeca_app
  USING (organization_id = app.org_id() OR app.is_platform())
  WITH CHECK (organization_id = app.org_id() OR app.is_platform());

-- Guard: what RLS cannot express (old vs new values). Applies only to the app role; the owner/seed is not limited.
CREATE OR REPLACE FUNCTION app.org_profiles_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'horeca_app' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'platform' THEN RAISE EXCEPTION 'platform organizations are created by the seed only'; END IF;
    IF NEW.status <> (CASE NEW.type WHEN 'supplier' THEN 'pending' ELSE 'approved' END)::org_status THEN
      RAISE EXCEPTION 'invalid initial status % for %', NEW.status, NEW.type;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.type IS DISTINCT FROM OLD.type THEN RAISE EXCEPTION 'organization type is immutable'; END IF;
  IF NOT app.is_platform() THEN
    IF NEW.tax_id IS DISTINCT FROM OLD.tax_id THEN RAISE EXCEPTION 'tax ID can only be changed by the platform'; END IF;
    -- The only status change a supplier may make itself: re-apply after rejection.
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'rejected' AND NEW.status = 'pending') THEN
      RAISE EXCEPTION 'status can only be changed by the platform';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER org_profiles_guard BEFORE INSERT OR UPDATE ON org_profiles
  FOR EACH ROW EXECUTE FUNCTION app.org_profiles_guard();

-- supplier_profiles (IBAN, commission override): supplier OWNER of that org, or platform.
CREATE POLICY supplier_profiles_read ON supplier_profiles FOR SELECT TO horeca_app USING (
  (organization_id = app.org_id() AND app.member_role() = 'owner') OR app.is_platform());
CREATE POLICY supplier_profiles_insert ON supplier_profiles FOR INSERT TO horeca_app
  WITH CHECK (organization_id = app.org_id() AND app.is_supplier());
CREATE POLICY supplier_profiles_update ON supplier_profiles FOR UPDATE TO horeca_app
  USING ((organization_id = app.org_id() AND app.member_role() = 'owner') OR app.is_platform())
  WITH CHECK ((organization_id = app.org_id() AND app.member_role() = 'owner') OR app.is_platform());

CREATE OR REPLACE FUNCTION app.supplier_profiles_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'horeca_app' OR app.is_platform() THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.commission_override_bps IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.commission_override_bps IS DISTINCT FROM OLD.commission_override_bps) THEN
    RAISE EXCEPTION 'commission override can only be set by the platform';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER supplier_profiles_guard BEFORE INSERT OR UPDATE ON supplier_profiles
  FOR EACH ROW EXECUTE FUNCTION app.supplier_profiles_guard();

-- buyer_locations: own buyer rows (owner and member); platform read.
CREATE POLICY buyer_locations_read ON buyer_locations FOR SELECT TO horeca_app USING (
  (organization_id = app.org_id() AND app.is_buyer()) OR app.is_platform());
CREATE POLICY buyer_locations_write ON buyer_locations FOR INSERT TO horeca_app
  WITH CHECK (organization_id = app.org_id() AND app.is_buyer());
CREATE POLICY buyer_locations_update ON buyer_locations FOR UPDATE TO horeca_app
  USING (organization_id = app.org_id() AND app.is_buyer()) WITH CHECK (organization_id = app.org_id() AND app.is_buyer());

-- ───────────── 6. Reference data: categories, attribute definitions, settings ─────────────
CREATE POLICY categories_read ON categories FOR SELECT TO horeca_app USING (app.logged_in());
CREATE POLICY categories_insert ON categories FOR INSERT TO horeca_app WITH CHECK (app.is_platform());
CREATE POLICY categories_update ON categories FOR UPDATE TO horeca_app USING (app.is_platform()) WITH CHECK (app.is_platform());

CREATE POLICY category_attributes_read ON category_attributes FOR SELECT TO horeca_app USING (app.logged_in());
CREATE POLICY category_attributes_insert ON category_attributes FOR INSERT TO horeca_app WITH CHECK (app.is_platform());
CREATE POLICY category_attributes_update ON category_attributes FOR UPDATE TO horeca_app USING (app.is_platform()) WITH CHECK (app.is_platform());

CREATE POLICY settings_read ON settings FOR SELECT TO horeca_app USING (app.logged_in());
CREATE POLICY settings_insert ON settings FOR INSERT TO horeca_app WITH CHECK (app.is_platform());
CREATE POLICY settings_update ON settings FOR UPDATE TO horeca_app USING (app.is_platform()) WITH CHECK (app.is_platform());

-- ───────────── 7. Catalogue ─────────────
-- A supplier may write its catalogue unless suspended (pending/rejected suppliers prepare their catalogue).
CREATE OR REPLACE FUNCTION app.own_supplier_can_edit() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.is_supplier() AND EXISTS (
    SELECT 1 FROM org_profiles op WHERE op.organization_id = app.org_id() AND op.status <> 'suspended')
$$;

-- products: own rows (any status); platform all; everyone logged in: active products of APPROVED suppliers.
CREATE POLICY products_read ON products FOR SELECT TO horeca_app USING (
  supplier_org_id = app.org_id() OR app.is_platform()
  OR (app.logged_in() AND status = 'active' AND EXISTS (
        SELECT 1 FROM org_profiles op
        WHERE op.organization_id = products.supplier_org_id AND op.type = 'supplier' AND op.status = 'approved')));
CREATE POLICY products_insert ON products FOR INSERT TO horeca_app
  WITH CHECK (supplier_org_id = app.org_id() AND app.own_supplier_can_edit());
CREATE POLICY products_update_own ON products FOR UPDATE TO horeca_app
  USING (supplier_org_id = app.org_id() AND app.own_supplier_can_edit())
  WITH CHECK (supplier_org_id = app.org_id() AND app.own_supplier_can_edit());
-- Moderation: platform may update (archive); "archive only, never edit" is enforced in the domain (product.moderate).
CREATE POLICY products_update_platform ON products FOR UPDATE TO horeca_app USING (app.is_platform()) WITH CHECK (app.is_platform());

-- product_images: visible exactly when the product is visible (the subquery runs under products' RLS).
CREATE POLICY product_images_read ON product_images FOR SELECT TO horeca_app USING (
  EXISTS (SELECT 1 FROM products p WHERE p.id = product_images.product_id));
CREATE POLICY product_images_write ON product_images FOR INSERT TO horeca_app WITH CHECK (
  supplier_org_id = app.org_id() AND app.own_supplier_can_edit()
  AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_images.product_id AND p.supplier_org_id = app.org_id()));
CREATE POLICY product_images_update ON product_images FOR UPDATE TO horeca_app
  USING (supplier_org_id = app.org_id() AND app.own_supplier_can_edit())
  WITH CHECK (supplier_org_id = app.org_id() AND app.own_supplier_can_edit());
CREATE POLICY product_images_delete ON product_images FOR DELETE TO horeca_app
  USING (supplier_org_id = app.org_id() AND app.own_supplier_can_edit());
CREATE POLICY product_images_worker_update ON product_images FOR UPDATE TO horeca_worker USING (true) WITH CHECK (true);

-- csv_imports: own supplier; platform read.
CREATE POLICY csv_imports_read ON csv_imports FOR SELECT TO horeca_app USING (supplier_org_id = app.org_id() OR app.is_platform());
CREATE POLICY csv_imports_insert ON csv_imports FOR INSERT TO horeca_app
  WITH CHECK (supplier_org_id = app.org_id() AND app.own_supplier_can_edit() AND created_by_user_id = app.user_id());
CREATE POLICY csv_imports_update ON csv_imports FOR UPDATE TO horeca_app
  USING (supplier_org_id = app.org_id() AND app.is_supplier()) WITH CHECK (supplier_org_id = app.org_id() AND app.is_supplier());

-- ───────────── 8. Cart ─────────────
CREATE POLICY carts_own ON carts FOR ALL TO horeca_app
  USING (buyer_org_id = app.org_id() AND app.is_buyer()) WITH CHECK (buyer_org_id = app.org_id() AND app.is_buyer());
CREATE POLICY cart_items_own ON cart_items FOR ALL TO horeca_app
  USING (buyer_org_id = app.org_id() AND app.is_buyer())
  WITH CHECK (buyer_org_id = app.org_id() AND app.is_buyer()
              AND EXISTS (SELECT 1 FROM carts c WHERE c.id = cart_items.cart_id AND c.buyer_org_id = app.org_id()));

-- ───────────── 9. Orders ─────────────
-- orders: buyer own; platform. Suppliers never read this table (their copy of the snapshots is on sub_orders).
-- No UPDATE grant at all: status and payment_status are written only by app.recompute_order().
CREATE POLICY orders_read ON orders FOR SELECT TO horeca_app USING ((buyer_org_id = app.org_id() AND app.is_buyer()) OR app.is_platform());
CREATE POLICY orders_insert ON orders FOR INSERT TO horeca_app
  WITH CHECK (buyer_org_id = app.org_id() AND app.is_buyer() AND placed_by_user_id = app.user_id());

-- sub_orders: buyer of the order, supplier of the sub-order, platform.
CREATE POLICY sub_orders_read ON sub_orders FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR (supplier_org_id = app.org_id() AND app.is_supplier()) OR app.is_platform());
CREATE POLICY sub_orders_insert ON sub_orders FOR INSERT TO horeca_app WITH CHECK (
  buyer_org_id = app.org_id() AND app.is_buyer() AND status = 'pending'
  AND EXISTS (SELECT 1 FROM orders o WHERE o.id = sub_orders.order_id AND o.buyer_org_id = app.org_id()));
-- Supplier transitions its own sub-orders (legal transitions: domain state machine).
CREATE POLICY sub_orders_update_supplier ON sub_orders FOR UPDATE TO horeca_app
  USING (supplier_org_id = app.org_id() AND app.is_supplier()) WITH CHECK (supplier_org_id = app.org_id() AND app.is_supplier());
-- Buyer may only cancel, and only while pending (matrix: "own (while pending)").
CREATE POLICY sub_orders_update_buyer ON sub_orders FOR UPDATE TO horeca_app
  USING (buyer_org_id = app.org_id() AND app.is_buyer() AND status = 'pending')
  WITH CHECK (buyer_org_id = app.org_id() AND app.is_buyer() AND status IN ('pending', 'cancelled'));
CREATE POLICY sub_orders_update_platform ON sub_orders FOR UPDATE TO horeca_app USING (app.is_platform()) WITH CHECK (app.is_platform());

-- order_lines: same visibility; inserted only at checkout by the buyer, with consistent denormalised org IDs.
CREATE POLICY order_lines_read ON order_lines FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR (supplier_org_id = app.org_id() AND app.is_supplier()) OR app.is_platform());
CREATE POLICY order_lines_insert ON order_lines FOR INSERT TO horeca_app WITH CHECK (
  buyer_org_id = app.org_id() AND app.is_buyer()
  AND EXISTS (SELECT 1 FROM sub_orders s WHERE s.id = order_lines.sub_order_id
              AND s.buyer_org_id = order_lines.buyer_org_id AND s.supplier_org_id = order_lines.supplier_org_id
              AND s.status = 'pending'));

-- sub_order_events: either party or the platform writes the event of a transition it performed.
CREATE POLICY sub_order_events_read ON sub_order_events FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR (supplier_org_id = app.org_id() AND app.is_supplier()) OR app.is_platform());
CREATE POLICY sub_order_events_insert ON sub_order_events FOR INSERT TO horeca_app WITH CHECK (
  actor_org_id = app.org_id() AND actor_user_id = app.user_id()
  AND ((buyer_org_id = app.org_id() AND app.is_buyer()) OR (supplier_org_id = app.org_id() AND app.is_supplier()) OR app.is_platform())
  AND EXISTS (SELECT 1 FROM sub_orders s WHERE s.id = sub_order_events.sub_order_id
              AND s.buyer_org_id = sub_order_events.buyer_org_id AND s.supplier_org_id = sub_order_events.supplier_org_id
              AND s.status = sub_order_events.to_status));

-- proforma_invoices: buyer own + platform read; v1 inserted by the buyer at checkout; later versions by the worker.
-- Suppliers have no access (the invoice lists other suppliers' lines and prices).
CREATE POLICY proforma_invoices_read ON proforma_invoices FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR app.is_platform());
CREATE POLICY proforma_invoices_insert ON proforma_invoices FOR INSERT TO horeca_app WITH CHECK (
  buyer_org_id = app.org_id() AND app.is_buyer() AND version = 1
  AND EXISTS (SELECT 1 FROM orders o WHERE o.id = proforma_invoices.order_id AND o.buyer_org_id = app.org_id()));
CREATE POLICY proforma_invoices_worker_insert ON proforma_invoices FOR INSERT TO horeca_worker WITH CHECK (true);
CREATE POLICY proforma_invoices_worker_update ON proforma_invoices FOR UPDATE TO horeca_worker USING (true) WITH CHECK (true);

-- order_payments: buyer reads own; platform records receipts/refunds from the bank statement.
CREATE POLICY order_payments_read ON order_payments FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR app.is_platform());
CREATE POLICY order_payments_insert ON order_payments FOR INSERT TO horeca_app WITH CHECK (
  app.is_platform() AND recorded_by_user_id = app.user_id()
  AND EXISTS (SELECT 1 FROM orders o WHERE o.id = order_payments.order_id AND o.buyer_org_id = order_payments.buyer_org_id));

-- ───────────── 10. Ledger ─────────────
-- Read: the supplier OWNER (matrix: ledger is owner-only) and the platform.
CREATE POLICY ledger_read ON ledger_entries FOR SELECT TO horeca_app USING (
  (supplier_org_id = app.org_id() AND app.is_supplier() AND app.member_role() = 'owner') OR app.is_platform());
-- Checkout (buyer context): sale = +gross and commission = −commission of a pending sub-order of the buyer's own order.
-- The amounts are checked against the sub-order, so a wrong amount cannot be booked even by a buggy service.
-- NOTE: the buyer cannot SELECT ledger rows → the insert must not use RETURNING.
CREATE POLICY ledger_insert_checkout ON ledger_entries FOR INSERT TO horeca_app WITH CHECK (
  app.is_buyer() AND created_by_user_id = app.user_id() AND type IN ('sale', 'commission')
  AND EXISTS (SELECT 1 FROM sub_orders s
              WHERE s.id = ledger_entries.sub_order_id AND s.buyer_org_id = app.org_id()
                AND s.supplier_org_id = ledger_entries.supplier_org_id AND s.status = 'pending'
                AND ledger_entries.amount_cents = CASE ledger_entries.type WHEN 'sale' THEN s.gross_cents
                                                                         ELSE -s.commission_cents END));
-- Cancellation (buyer, supplier or platform — whoever cancelled): reversals of a sub-order that IS cancelled
-- (the status update runs first in the same transaction), with the exact mirrored amounts.
CREATE POLICY ledger_insert_reversal ON ledger_entries FOR INSERT TO horeca_app WITH CHECK (
  type IN ('sale_reversal', 'commission_reversal') AND created_by_user_id = app.user_id()
  AND EXISTS (SELECT 1 FROM sub_orders s
              WHERE s.id = ledger_entries.sub_order_id AND s.supplier_org_id = ledger_entries.supplier_org_id
                AND s.status = 'cancelled'
                AND ((s.buyer_org_id = app.org_id() AND app.is_buyer())
                     OR (s.supplier_org_id = app.org_id() AND app.is_supplier()) OR app.is_platform())
                AND ledger_entries.amount_cents = CASE ledger_entries.type WHEN 'sale_reversal' THEN -s.gross_cents
                                                                         ELSE s.commission_cents END));
-- Payouts and adjustments: platform admin only.
CREATE POLICY ledger_insert_platform ON ledger_entries FOR INSERT TO horeca_app WITH CHECK (
  app.is_platform() AND created_by_user_id = app.user_id() AND type IN ('payout', 'adjustment'));

-- ───────────── 11. Audit log ─────────────
CREATE POLICY audit_log_read ON audit_log FOR SELECT TO horeca_app USING (app.is_platform());
CREATE POLICY audit_log_insert ON audit_log FOR INSERT TO horeca_app WITH CHECK (
  actor_org_id = app.org_id() AND actor_user_id = app.user_id() AND actor_org_type::text = app.org_type());
CREATE POLICY audit_log_worker_insert ON audit_log FOR INSERT TO horeca_worker WITH CHECK (actor_user_id IS NULL);

-- ───────────── 12. SECURITY DEFINER helpers (run as the owner; each checks its caller itself) ─────────────

-- Gapless pro-forma number for the current year. The counter row stays locked until the checkout
-- transaction ends; a rollback rolls the increment back → no gaps (decision 11.7).
CREATE OR REPLACE FUNCTION app.next_invoice_number() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE y int := extract(year FROM now())::int; n int;
BEGIN
  IF NOT app.is_buyer() THEN RAISE EXCEPTION 'next_invoice_number: only the checkout (buyer context) issues invoices'; END IF;
  INSERT INTO invoice_counters AS c (year, last_value) VALUES (y, 1)
  ON CONFLICT (year) DO UPDATE SET last_value = c.last_value + 1
  RETURNING last_value INTO n;
  RETURN format('PF-%s-%s', y, lpad(n::text, 6, '0'));
END $$;

-- Commission rate for a supplier: override → platform default (decision 11.3). Callable by any logged-in org,
-- because the buyer's checkout must resolve it while it cannot read supplier_profiles.
CREATE OR REPLACE FUNCTION app.resolve_commission_bps(p_supplier_org_id text) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v integer;
BEGIN
  IF NOT app.logged_in() THEN RAISE EXCEPTION 'resolve_commission_bps: no actor'; END IF;
  SELECT coalesce(sp.commission_override_bps, (SELECT (s.value #>> '{}')::integer FROM settings s WHERE s.key = 'default_commission_bps'))
    INTO v FROM supplier_profiles sp WHERE sp.organization_id = p_supplier_org_id;
  IF v IS NULL THEN RAISE EXCEPTION 'no commission rate for supplier %', p_supplier_org_id; END IF;
  RETURN v;
END $$;

-- Derived order status + payment status (money-rules.md §5–6). Called by transition() and by payment
-- recording in the same transaction. Suppliers may trigger it for orders containing their sub-order.
CREATE OR REPLACE FUNCTION app.recompute_order(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_buyer text; v_total int; v_cancelled int; v_done int; v_due bigint; v_paid bigint;
  v_status order_status; v_pay order_payment_status;
BEGIN
  SELECT buyer_org_id INTO v_buyer FROM orders WHERE id = p_order_id;
  IF v_buyer IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  IF NOT (session_user = 'horeca_worker' OR current_setting('role', true) = 'horeca_worker'
          OR app.is_platform()
          OR (app.is_buyer() AND v_buyer = app.org_id())
          OR (app.is_supplier() AND EXISTS (SELECT 1 FROM sub_orders s WHERE s.order_id = p_order_id AND s.supplier_org_id = app.org_id()))) THEN
    RAISE EXCEPTION 'order not found';   -- foreign order: same answer as a missing one
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status = 'cancelled'), count(*) FILTER (WHERE status IN ('delivered', 'cancelled')),
         coalesce(sum(gross_cents) FILTER (WHERE status <> 'cancelled'), 0)
    INTO v_total, v_cancelled, v_done, v_due
    FROM sub_orders WHERE order_id = p_order_id;
  SELECT coalesce(sum(CASE type WHEN 'receipt' THEN amount_cents ELSE -amount_cents END), 0)
    INTO v_paid FROM order_payments WHERE order_id = p_order_id;

  v_status := CASE WHEN v_cancelled = v_total THEN 'cancelled' WHEN v_done = v_total THEN 'completed' ELSE 'in_progress' END;
  v_pay    := CASE WHEN v_paid > v_due THEN 'refund_due' WHEN v_paid = v_due AND v_due > 0 THEN 'paid' ELSE 'unpaid' END;

  UPDATE orders SET status = v_status, payment_status = v_pay WHERE id = p_order_id;
  UPDATE sub_orders SET order_payment_status = v_pay WHERE order_id = p_order_id;
END $$;

REVOKE ALL ON FUNCTION app.next_invoice_number(), app.resolve_commission_bps(text), app.recompute_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.next_invoice_number(), app.resolve_commission_bps(text), app.recompute_order(uuid) TO horeca_app;
GRANT EXECUTE ON FUNCTION app.recompute_order(uuid) TO horeca_worker;

-- ════════════════════════════════════════════ STRETCH ════════════════════════════════════════════
-- Apply together with the stretch migrations (S1, S5, S6). Not part of the MVP migration.

-- S1 ─ price tiers are visible with the product; buyer prices only to the named buyer, the supplier and the platform.
GRANT SELECT, INSERT, UPDATE, DELETE ON price_tiers, buyer_prices TO horeca_app;
GRANT SELECT ON price_tiers, buyer_prices TO horeca_worker;
ALTER TABLE price_tiers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY price_tiers_read ON price_tiers FOR SELECT TO horeca_app USING (EXISTS (SELECT 1 FROM products p WHERE p.id = price_tiers.product_id));
CREATE POLICY price_tiers_write ON price_tiers FOR ALL TO horeca_app
  USING (supplier_org_id = app.org_id() AND app.own_supplier_can_edit())
  WITH CHECK (supplier_org_id = app.org_id() AND app.own_supplier_can_edit()
              AND EXISTS (SELECT 1 FROM products p WHERE p.id = price_tiers.product_id AND p.supplier_org_id = app.org_id()));
CREATE POLICY buyer_prices_read ON buyer_prices FOR SELECT TO horeca_app USING (
  supplier_org_id = app.org_id() OR (buyer_org_id = app.org_id() AND app.is_buyer()) OR app.is_platform());
CREATE POLICY buyer_prices_write ON buyer_prices FOR ALL TO horeca_app
  USING (supplier_org_id = app.org_id() AND app.own_supplier_can_edit())
  WITH CHECK (supplier_org_id = app.org_id() AND app.own_supplier_can_edit()
              AND EXISTS (SELECT 1 FROM products p WHERE p.id = buyer_prices.product_id AND p.supplier_org_id = app.org_id()));
CREATE POLICY worker_read ON price_tiers  FOR SELECT TO horeca_worker USING (true);
CREATE POLICY worker_read ON buyer_prices FOR SELECT TO horeca_worker USING (true);

-- S5 ─ RFQ: only invited suppliers see a request (rfq_requests → rfq_invitations; never the other way, no recursion).
GRANT SELECT, INSERT, UPDATE ON rfq_requests, rfq_quotes TO horeca_app;
GRANT SELECT, INSERT ON rfq_invitations TO horeca_app;
GRANT SELECT ON rfq_requests, rfq_invitations, rfq_quotes TO horeca_worker;
ALTER TABLE rfq_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_quotes      ENABLE ROW LEVEL SECURITY;
CREATE POLICY rfq_invitations_read ON rfq_invitations FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR (supplier_org_id = app.org_id() AND app.is_supplier()) OR app.is_platform());
CREATE POLICY rfq_invitations_insert ON rfq_invitations FOR INSERT TO horeca_app WITH CHECK (
  buyer_org_id = app.org_id() AND app.is_buyer()
  AND EXISTS (SELECT 1 FROM rfq_requests r WHERE r.id = rfq_invitations.rfq_id AND r.buyer_org_id = app.org_id()));
CREATE POLICY rfq_requests_read ON rfq_requests FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR app.is_platform()
  OR (app.is_supplier() AND EXISTS (SELECT 1 FROM rfq_invitations i WHERE i.rfq_id = rfq_requests.id AND i.supplier_org_id = app.org_id())));
CREATE POLICY rfq_requests_write ON rfq_requests FOR INSERT TO horeca_app WITH CHECK (buyer_org_id = app.org_id() AND app.is_buyer());
CREATE POLICY rfq_requests_update ON rfq_requests FOR UPDATE TO horeca_app
  USING (buyer_org_id = app.org_id() AND app.is_buyer()) WITH CHECK (buyer_org_id = app.org_id() AND app.is_buyer());
CREATE POLICY rfq_quotes_read ON rfq_quotes FOR SELECT TO horeca_app USING (
  (supplier_org_id = app.org_id() AND app.is_supplier()) OR (buyer_org_id = app.org_id() AND app.is_buyer()) OR app.is_platform());
CREATE POLICY rfq_quotes_insert ON rfq_quotes FOR INSERT TO horeca_app WITH CHECK (
  supplier_org_id = app.org_id() AND app.is_supplier()
  AND EXISTS (SELECT 1 FROM rfq_invitations i WHERE i.rfq_id = rfq_quotes.rfq_id AND i.supplier_org_id = app.org_id()
              AND i.buyer_org_id = rfq_quotes.buyer_org_id));
CREATE POLICY rfq_quotes_update ON rfq_quotes FOR UPDATE TO horeca_app
  USING ((supplier_org_id = app.org_id() AND app.is_supplier()) OR (buyer_org_id = app.org_id() AND app.is_buyer()))
  WITH CHECK ((supplier_org_id = app.org_id() AND app.is_supplier()) OR (buyer_org_id = app.org_id() AND app.is_buyer()));
CREATE POLICY worker_read ON rfq_requests    FOR SELECT TO horeca_worker USING (true);
CREATE POLICY worker_read ON rfq_invitations FOR SELECT TO horeca_worker USING (true);
CREATE POLICY worker_read ON rfq_quotes      FOR SELECT TO horeca_worker USING (true);

-- S6 ─ card payments: the buyer creates an attempt; callbacks are processed by the worker (system context).
GRANT SELECT, INSERT ON payments TO horeca_app;
GRANT SELECT, UPDATE (status, provider_ref, updated_at) ON payments TO horeca_worker;
GRANT SELECT, INSERT ON payment_events TO horeca_worker;
GRANT SELECT ON payment_events TO horeca_app;
GRANT INSERT ON order_payments TO horeca_worker;
ALTER TABLE payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_read ON payments FOR SELECT TO horeca_app USING ((buyer_org_id = app.org_id() AND app.is_buyer()) OR app.is_platform());
CREATE POLICY payments_insert ON payments FOR INSERT TO horeca_app WITH CHECK (
  buyer_org_id = app.org_id() AND app.is_buyer()
  AND EXISTS (SELECT 1 FROM orders o WHERE o.id = payments.order_id AND o.buyer_org_id = app.org_id()));
CREATE POLICY payment_events_read ON payment_events FOR SELECT TO horeca_app USING (app.is_platform());
CREATE POLICY worker_all ON payments FOR ALL TO horeca_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_all ON payment_events FOR ALL TO horeca_worker USING (true) WITH CHECK (true);
CREATE POLICY order_payments_worker_insert ON order_payments FOR INSERT TO horeca_worker
  WITH CHECK (type = 'receipt' AND payment_id IS NOT NULL AND recorded_by_user_id IS NULL);
