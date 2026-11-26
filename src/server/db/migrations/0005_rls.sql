-- D4-B2 — Row-level security: context helpers, policies, guard triggers and SECURITY DEFINER functions.
-- Source: docs/decisions-9-11/schema/rls.sql (MVP part) with the edits of APPLIED.md §2 and §4 (decision 012).
-- Layering: policy.can + scoped queries in the domain are the FIRST line; this file is the SECOND line, so a
-- query that forgets a WHERE clause still sees only its own organization. RLS is ENABLEd, not FORCEd: the owner
-- (migrations, seed, tests' fixtures) and the SECURITY DEFINER functions below bypass it by design.
-- The table grants already live in 0001–0004; only the sequence and the function grants are added here.
-- Not in this file (they need tables that arrive with D5-B0): the agreement check on direct sub-orders,
-- the worker's INSERT policy on order_payments, payments / payment_events, app.system_cancel_sub_order.

-- ───────────── 1. Context helpers ─────────────
-- withTx(actor) sets app.user_id / app.org_id / app.org_type / app.role with set_config(…, true) at the start of
-- every transaction. No context → every helper returns NULL → every tenant policy is false → zero rows.
CREATE SCHEMA app;--> statement-breakpoint
CREATE FUNCTION app.user_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;--> statement-breakpoint
CREATE FUNCTION app.org_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id', true), '') $$;--> statement-breakpoint
CREATE FUNCTION app.org_type() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_type', true), '') $$;--> statement-breakpoint
CREATE FUNCTION app.member_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.role', true), '') $$;--> statement-breakpoint
CREATE FUNCTION app.is_platform() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(app.org_type() = 'platform' AND app.org_id() IS NOT NULL, false) $$;--> statement-breakpoint
CREATE FUNCTION app.is_buyer() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(app.org_type() = 'buyer' AND app.org_id() IS NOT NULL, false) $$;--> statement-breakpoint
CREATE FUNCTION app.is_supplier() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(app.org_type() = 'supplier' AND app.org_id() IS NOT NULL, false) $$;--> statement-breakpoint
CREATE FUNCTION app.logged_in() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app.org_id() IS NOT NULL $$;--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO horeca_app, horeca_worker;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO horeca_app, horeca_worker;--> statement-breakpoint

-- Pro-forma numbers: a plain sequence (decision 012; no gapless counter, a rolled-back checkout may leave a gap).
CREATE SEQUENCE invoice_number_seq;--> statement-breakpoint

-- ───────────── 2. Enable RLS on every tenant / reference table ─────────────
ALTER TABLE org_profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE supplier_profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE buyer_locations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE category_attributes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE products ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE csv_imports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sub_orders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE sub_order_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE proforma_invoices ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Worker (system context) reads every row of the tables it was granted SELECT on. One policy per table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['org_profiles', 'supplier_profiles', 'buyer_locations', 'categories', 'category_attributes',
    'settings', 'products', 'product_images', 'csv_imports', 'orders', 'sub_orders', 'order_lines', 'sub_order_events',
    'proforma_invoices', 'order_payments', 'ledger_entries'] LOOP
    EXECUTE format('CREATE POLICY worker_read ON %I FOR SELECT TO horeca_worker USING (true)', t);
  END LOOP;
END $$;--> statement-breakpoint

-- ───────────── 3. Identity ─────────────
-- org_profiles: own row; platform all; approved suppliers are visible to every logged-in org (catalogue, invoices).
CREATE POLICY org_profiles_read ON org_profiles FOR SELECT TO horeca_app USING (
  organization_id = app.org_id() OR app.is_platform()
  OR (app.logged_in() AND type = 'supplier' AND status = 'approved'));--> statement-breakpoint
-- 012: the platform inserts supplier profiles (admin creates suppliers); a buyer inserts its own at registration.
CREATE POLICY org_profiles_insert ON org_profiles FOR INSERT TO horeca_app
  WITH CHECK (organization_id = app.org_id() OR app.is_platform());--> statement-breakpoint
CREATE POLICY org_profiles_update ON org_profiles FOR UPDATE TO horeca_app
  USING (organization_id = app.org_id() OR app.is_platform())
  WITH CHECK (organization_id = app.org_id() OR app.is_platform());--> statement-breakpoint

-- Guard: what RLS cannot express (old vs new values). Applies only to the app role; the owner/seed is not limited.
CREATE FUNCTION app.org_profiles_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'horeca_app' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'platform' THEN RAISE EXCEPTION 'platform organizations are created by the seed only'; END IF;
    -- 012: public registration creates buyers only; a supplier profile is inserted by the platform, as approved.
    IF NEW.type = 'supplier' AND NOT app.is_platform() THEN
      RAISE EXCEPTION 'supplier organizations are created by the platform only';
    END IF;
    IF NEW.status <> 'approved' THEN
      RAISE EXCEPTION 'invalid initial status % for %', NEW.status, NEW.type;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.type IS DISTINCT FROM OLD.type THEN RAISE EXCEPTION 'organization type is immutable'; END IF;
  IF NOT app.is_platform() THEN
    IF NEW.tax_id IS DISTINCT FROM OLD.tax_id THEN RAISE EXCEPTION 'tax ID can only be changed by the platform'; END IF;
    -- 012: no re-apply flow — every status change belongs to the platform.
    IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'status can only be changed by the platform'; END IF;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER org_profiles_guard BEFORE INSERT OR UPDATE ON org_profiles
  FOR EACH ROW EXECUTE FUNCTION app.org_profiles_guard();--> statement-breakpoint

-- supplier_profiles (IBAN, commission override): supplier OWNER of that org, or platform.
CREATE POLICY supplier_profiles_read ON supplier_profiles FOR SELECT TO horeca_app USING (
  (organization_id = app.org_id() AND app.member_role() = 'owner') OR app.is_platform());--> statement-breakpoint
-- 012: only the admin creates suppliers (the seed runs as the owner), so a supplier no longer inserts its own profile.
CREATE POLICY supplier_profiles_insert ON supplier_profiles FOR INSERT TO horeca_app
  WITH CHECK (app.is_platform());--> statement-breakpoint
CREATE POLICY supplier_profiles_update ON supplier_profiles FOR UPDATE TO horeca_app
  USING ((organization_id = app.org_id() AND app.member_role() = 'owner') OR app.is_platform())
  WITH CHECK ((organization_id = app.org_id() AND app.member_role() = 'owner') OR app.is_platform());--> statement-breakpoint

CREATE FUNCTION app.supplier_profiles_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'horeca_app' OR app.is_platform() THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.commission_override_bps IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.commission_override_bps IS DISTINCT FROM OLD.commission_override_bps) THEN
    RAISE EXCEPTION 'commission override can only be set by the platform';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER supplier_profiles_guard BEFORE INSERT OR UPDATE ON supplier_profiles
  FOR EACH ROW EXECUTE FUNCTION app.supplier_profiles_guard();--> statement-breakpoint

-- buyer_locations: own buyer rows (owner and member); platform read.
CREATE POLICY buyer_locations_read ON buyer_locations FOR SELECT TO horeca_app USING (
  (organization_id = app.org_id() AND app.is_buyer()) OR app.is_platform());--> statement-breakpoint
CREATE POLICY buyer_locations_write ON buyer_locations FOR INSERT TO horeca_app
  WITH CHECK (organization_id = app.org_id() AND app.is_buyer());--> statement-breakpoint
CREATE POLICY buyer_locations_update ON buyer_locations FOR UPDATE TO horeca_app
  USING (organization_id = app.org_id() AND app.is_buyer()) WITH CHECK (organization_id = app.org_id() AND app.is_buyer());--> statement-breakpoint

-- ───────────── 4. Reference data: categories, attribute definitions, settings ─────────────
CREATE POLICY categories_read ON categories FOR SELECT TO horeca_app USING (app.logged_in());--> statement-breakpoint
CREATE POLICY categories_insert ON categories FOR INSERT TO horeca_app WITH CHECK (app.is_platform());--> statement-breakpoint
CREATE POLICY categories_update ON categories FOR UPDATE TO horeca_app USING (app.is_platform()) WITH CHECK (app.is_platform());--> statement-breakpoint

CREATE POLICY category_attributes_read ON category_attributes FOR SELECT TO horeca_app USING (app.logged_in());--> statement-breakpoint
CREATE POLICY category_attributes_insert ON category_attributes FOR INSERT TO horeca_app WITH CHECK (app.is_platform());--> statement-breakpoint
CREATE POLICY category_attributes_update ON category_attributes FOR UPDATE TO horeca_app USING (app.is_platform()) WITH CHECK (app.is_platform());--> statement-breakpoint

CREATE POLICY settings_read ON settings FOR SELECT TO horeca_app USING (app.logged_in());--> statement-breakpoint
CREATE POLICY settings_insert ON settings FOR INSERT TO horeca_app WITH CHECK (app.is_platform());--> statement-breakpoint
CREATE POLICY settings_update ON settings FOR UPDATE TO horeca_app USING (app.is_platform()) WITH CHECK (app.is_platform());--> statement-breakpoint

-- ───────────── 5. Catalogue ─────────────
-- A supplier may write its catalogue unless suspended.
CREATE FUNCTION app.own_supplier_can_edit() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.is_supplier() AND EXISTS (
    SELECT 1 FROM org_profiles op WHERE op.organization_id = app.org_id() AND op.status <> 'suspended')
$$;--> statement-breakpoint

-- products: own rows (any status); platform all; everyone logged in: active products of APPROVED suppliers.
CREATE POLICY products_read ON products FOR SELECT TO horeca_app USING (
  supplier_org_id = app.org_id() OR app.is_platform()
  OR (app.logged_in() AND status = 'active' AND EXISTS (
        SELECT 1 FROM org_profiles op
        WHERE op.organization_id = products.supplier_org_id AND op.type = 'supplier' AND op.status = 'approved')));--> statement-breakpoint
CREATE POLICY products_insert ON products FOR INSERT TO horeca_app
  WITH CHECK (supplier_org_id = app.org_id() AND app.own_supplier_can_edit());--> statement-breakpoint
CREATE POLICY products_update_own ON products FOR UPDATE TO horeca_app
  USING (supplier_org_id = app.org_id() AND app.own_supplier_can_edit())
  WITH CHECK (supplier_org_id = app.org_id() AND app.own_supplier_can_edit());--> statement-breakpoint
-- Moderation: the platform may update (archive); "archive only, never edit" is enforced in the domain (product.moderate).
CREATE POLICY products_update_platform ON products FOR UPDATE TO horeca_app USING (app.is_platform()) WITH CHECK (app.is_platform());--> statement-breakpoint

-- product_images: visible exactly when the product is visible (the subquery runs under products' RLS).
CREATE POLICY product_images_read ON product_images FOR SELECT TO horeca_app USING (
  EXISTS (SELECT 1 FROM products p WHERE p.id = product_images.product_id));--> statement-breakpoint
CREATE POLICY product_images_write ON product_images FOR INSERT TO horeca_app WITH CHECK (
  supplier_org_id = app.org_id() AND app.own_supplier_can_edit()
  AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_images.product_id AND p.supplier_org_id = app.org_id()));--> statement-breakpoint
CREATE POLICY product_images_update ON product_images FOR UPDATE TO horeca_app
  USING (supplier_org_id = app.org_id() AND app.own_supplier_can_edit())
  WITH CHECK (supplier_org_id = app.org_id() AND app.own_supplier_can_edit());--> statement-breakpoint
CREATE POLICY product_images_delete ON product_images FOR DELETE TO horeca_app
  USING (supplier_org_id = app.org_id() AND app.own_supplier_can_edit());--> statement-breakpoint
-- The column grant (status, width, height) is what limits the image job.
CREATE POLICY product_images_worker_update ON product_images FOR UPDATE TO horeca_worker USING (true) WITH CHECK (true);--> statement-breakpoint

-- csv_imports: own supplier; platform read.
CREATE POLICY csv_imports_read ON csv_imports FOR SELECT TO horeca_app USING (supplier_org_id = app.org_id() OR app.is_platform());--> statement-breakpoint
CREATE POLICY csv_imports_insert ON csv_imports FOR INSERT TO horeca_app
  WITH CHECK (supplier_org_id = app.org_id() AND app.own_supplier_can_edit() AND created_by_user_id = app.user_id());--> statement-breakpoint
CREATE POLICY csv_imports_update ON csv_imports FOR UPDATE TO horeca_app
  USING (supplier_org_id = app.org_id() AND app.is_supplier()) WITH CHECK (supplier_org_id = app.org_id() AND app.is_supplier());--> statement-breakpoint

-- ───────────── 6. Cart ─────────────
CREATE POLICY carts_own ON carts FOR ALL TO horeca_app
  USING (buyer_org_id = app.org_id() AND app.is_buyer()) WITH CHECK (buyer_org_id = app.org_id() AND app.is_buyer());--> statement-breakpoint
CREATE POLICY cart_items_own ON cart_items FOR ALL TO horeca_app
  USING (buyer_org_id = app.org_id() AND app.is_buyer())
  WITH CHECK (buyer_org_id = app.org_id() AND app.is_buyer()
              AND EXISTS (SELECT 1 FROM carts c WHERE c.id = cart_items.cart_id AND c.buyer_org_id = app.org_id()));--> statement-breakpoint

-- ───────────── 7. Orders ─────────────
-- orders: buyer own; platform. Suppliers never read this table (their copy of the snapshots is on sub_orders).
-- No UPDATE grant at all: status and payment_status are written only by app.recompute_order().
-- A new order always starts in_progress / unpaid (the checkout calls recompute_order afterwards).
CREATE POLICY orders_read ON orders FOR SELECT TO horeca_app USING ((buyer_org_id = app.org_id() AND app.is_buyer()) OR app.is_platform());--> statement-breakpoint
CREATE POLICY orders_insert ON orders FOR INSERT TO horeca_app
  WITH CHECK (buyer_org_id = app.org_id() AND app.is_buyer() AND placed_by_user_id = app.user_id()
              AND status = 'in_progress' AND payment_status = 'unpaid');--> statement-breakpoint

-- sub_orders: buyer of the order, supplier of the sub-order, platform.
CREATE POLICY sub_orders_read ON sub_orders FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR (supplier_org_id = app.org_id() AND app.is_supplier()) OR app.is_platform());--> statement-breakpoint
-- A new sub-order starts pending, not yet submitted, unpaid. (The agreement check for mode = 'direct' comes with D5-B0.)
CREATE POLICY sub_orders_insert ON sub_orders FOR INSERT TO horeca_app WITH CHECK (
  buyer_org_id = app.org_id() AND app.is_buyer() AND status = 'pending'
  AND supplier_submission = 'pending' AND order_payment_status = 'unpaid'
  AND EXISTS (SELECT 1 FROM orders o WHERE o.id = sub_orders.order_id AND o.buyer_org_id = app.org_id()));--> statement-breakpoint
-- Supplier transitions its own sub-orders (legal transitions: domain state machine). Only four columns are granted.
-- Second layer (012 §4, M2): a platform sub-order is shipped only after the order is paid.
CREATE POLICY sub_orders_update_supplier ON sub_orders FOR UPDATE TO horeca_app
  USING (supplier_org_id = app.org_id() AND app.is_supplier())
  WITH CHECK (supplier_org_id = app.org_id() AND app.is_supplier()
              AND (status <> 'shipped' OR mode = 'direct' OR order_payment_status = 'paid'));--> statement-breakpoint
-- Buyer may only cancel, and only while pending (matrix: "own (while pending)").
CREATE POLICY sub_orders_update_buyer ON sub_orders FOR UPDATE TO horeca_app
  USING (buyer_org_id = app.org_id() AND app.is_buyer() AND status = 'pending')
  WITH CHECK (buyer_org_id = app.org_id() AND app.is_buyer() AND status IN ('pending', 'cancelled'));--> statement-breakpoint
CREATE POLICY sub_orders_update_platform ON sub_orders FOR UPDATE TO horeca_app USING (app.is_platform()) WITH CHECK (app.is_platform());--> statement-breakpoint
-- The worker writes supplier_submission only: the column grant (0004) limits it, this policy lets the rows through.
CREATE POLICY sub_orders_worker_update ON sub_orders FOR UPDATE TO horeca_worker USING (true) WITH CHECK (true);--> statement-breakpoint

-- order_lines: same visibility; inserted only at checkout by the buyer, with consistent denormalised org IDs.
CREATE POLICY order_lines_read ON order_lines FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR (supplier_org_id = app.org_id() AND app.is_supplier()) OR app.is_platform());--> statement-breakpoint
CREATE POLICY order_lines_insert ON order_lines FOR INSERT TO horeca_app WITH CHECK (
  buyer_org_id = app.org_id() AND app.is_buyer()
  AND EXISTS (SELECT 1 FROM sub_orders s WHERE s.id = order_lines.sub_order_id
              AND s.buyer_org_id = order_lines.buyer_org_id AND s.supplier_org_id = order_lines.supplier_org_id
              AND s.status = 'pending'));--> statement-breakpoint

-- sub_order_events: either party or the platform writes the event of a transition it performed.
CREATE POLICY sub_order_events_read ON sub_order_events FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR (supplier_org_id = app.org_id() AND app.is_supplier()) OR app.is_platform());--> statement-breakpoint
CREATE POLICY sub_order_events_insert ON sub_order_events FOR INSERT TO horeca_app WITH CHECK (
  actor_org_id = app.org_id() AND actor_user_id = app.user_id()
  AND ((buyer_org_id = app.org_id() AND app.is_buyer()) OR (supplier_org_id = app.org_id() AND app.is_supplier()) OR app.is_platform())
  AND EXISTS (SELECT 1 FROM sub_orders s WHERE s.id = sub_order_events.sub_order_id
              AND s.buyer_org_id = sub_order_events.buyer_org_id AND s.supplier_org_id = sub_order_events.supplier_org_id
              AND s.status = sub_order_events.to_status));--> statement-breakpoint

-- proforma_invoices: buyer own + platform read; inserted once by the buyer at checkout (version 1, platform part only).
-- Suppliers have no access (the invoice lists other suppliers' lines and prices). 012: the worker never inserts
-- (no re-issue); it only stores the rendered PDF (column grant: status, storage_key, pdf_generated_at).
CREATE POLICY proforma_invoices_read ON proforma_invoices FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR app.is_platform());--> statement-breakpoint
CREATE POLICY proforma_invoices_insert ON proforma_invoices FOR INSERT TO horeca_app WITH CHECK (
  buyer_org_id = app.org_id() AND app.is_buyer() AND version = 1
  AND EXISTS (SELECT 1 FROM orders o WHERE o.id = proforma_invoices.order_id AND o.buyer_org_id = app.org_id()));--> statement-breakpoint
CREATE POLICY proforma_invoices_worker_update ON proforma_invoices FOR UPDATE TO horeca_worker USING (true) WITH CHECK (true);--> statement-breakpoint

-- order_payments: buyer reads own; the platform may record a receipt/refund from the bank statement.
-- (The worker's insert policy for card payments comes with D5-B0.)
CREATE POLICY order_payments_read ON order_payments FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR app.is_platform());--> statement-breakpoint
CREATE POLICY order_payments_insert ON order_payments FOR INSERT TO horeca_app WITH CHECK (
  app.is_platform() AND recorded_by_user_id = app.user_id()
  AND EXISTS (SELECT 1 FROM orders o WHERE o.id = order_payments.order_id AND o.buyer_org_id = order_payments.buyer_org_id));--> statement-breakpoint

-- ───────────── 8. Ledger ─────────────
-- Read: the supplier OWNER (matrix: ledger is owner-only) and the platform.
CREATE POLICY ledger_read ON ledger_entries FOR SELECT TO horeca_app USING (
  (supplier_org_id = app.org_id() AND app.is_supplier() AND app.member_role() = 'owner') OR app.is_platform());--> statement-breakpoint
-- Checkout (buyer context): sale = +gross (platform mode only) and commission = −commission (both modes) of a pending
-- sub-order of the buyer's own order. The amounts are checked against the sub-order, so a wrong amount cannot be
-- booked even by a buggy service. NOTE: the buyer cannot SELECT ledger rows → the insert must not use RETURNING.
CREATE POLICY ledger_insert_checkout ON ledger_entries FOR INSERT TO horeca_app WITH CHECK (
  app.is_buyer() AND created_by_user_id = app.user_id() AND type IN ('sale', 'commission')
  AND EXISTS (SELECT 1 FROM sub_orders s
              WHERE s.id = ledger_entries.sub_order_id AND s.buyer_org_id = app.org_id()
                AND s.supplier_org_id = ledger_entries.supplier_org_id AND s.status = 'pending'
                AND NOT (ledger_entries.type = 'sale' AND s.mode = 'direct')
                AND ledger_entries.amount_cents = CASE ledger_entries.type WHEN 'sale' THEN s.gross_cents
                                                                         ELSE -s.commission_cents END));--> statement-breakpoint
-- Cancellation (buyer, supplier or platform — whoever cancelled): reversals of a sub-order that IS cancelled (the
-- status update runs first in the same transaction), with the exact mirrored amounts. A direct sub-order never
-- had a sale, so it books only commission_reversal and its entries sum to 0.
CREATE POLICY ledger_insert_reversal ON ledger_entries FOR INSERT TO horeca_app WITH CHECK (
  type IN ('sale_reversal', 'commission_reversal') AND created_by_user_id = app.user_id()
  AND EXISTS (SELECT 1 FROM sub_orders s
              WHERE s.id = ledger_entries.sub_order_id AND s.supplier_org_id = ledger_entries.supplier_org_id
                AND s.status = 'cancelled'
                AND NOT (ledger_entries.type = 'sale_reversal' AND s.mode = 'direct')
                AND ((s.buyer_org_id = app.org_id() AND app.is_buyer())
                     OR (s.supplier_org_id = app.org_id() AND app.is_supplier()) OR app.is_platform())
                AND ledger_entries.amount_cents = CASE ledger_entries.type WHEN 'sale_reversal' THEN -s.gross_cents
                                                                         ELSE s.commission_cents END));--> statement-breakpoint
-- Payouts, adjustments and commission payments (a direct-mode supplier paying its commission): platform admin only.
CREATE POLICY ledger_insert_platform ON ledger_entries FOR INSERT TO horeca_app WITH CHECK (
  app.is_platform() AND created_by_user_id = app.user_id() AND type IN ('payout', 'adjustment', 'commission_payment'));--> statement-breakpoint

-- ───────────── 9. Audit log ─────────────
CREATE POLICY audit_log_read ON audit_log FOR SELECT TO horeca_app USING (app.is_platform());--> statement-breakpoint
CREATE POLICY audit_log_insert ON audit_log FOR INSERT TO horeca_app WITH CHECK (
  actor_org_id = app.org_id() AND actor_user_id = app.user_id() AND actor_org_type::text = app.org_type());--> statement-breakpoint
CREATE POLICY audit_log_worker_insert ON audit_log FOR INSERT TO horeca_worker WITH CHECK (actor_user_id IS NULL);--> statement-breakpoint

-- ───────────── 10. SECURITY DEFINER functions (run as the owner; each checks its caller itself) ─────────────

-- Pro-forma number PF-<year>-<6 digits> from a plain sequence (decision 012). Only the checkout (buyer context).
CREATE FUNCTION app.next_invoice_number() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app.is_buyer() THEN RAISE EXCEPTION 'next_invoice_number: only the checkout (buyer context) issues invoices'; END IF;
  RETURN format('PF-%s-%s', extract(year FROM now())::int, lpad(nextval('invoice_number_seq')::text, 6, '0'));
END $$;--> statement-breakpoint

-- Commission rate for a supplier: override → platform default (decision 11.3). Callable by any logged-in org,
-- because the buyer's checkout must resolve it while it cannot read supplier_profiles.
CREATE FUNCTION app.resolve_commission_bps(p_supplier_org_id text) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v integer;
BEGIN
  IF NOT app.logged_in() THEN RAISE EXCEPTION 'resolve_commission_bps: no actor'; END IF;
  SELECT coalesce(sp.commission_override_bps, (SELECT (s.value #>> '{}')::integer FROM settings s WHERE s.key = 'default_commission_bps'))
    INTO v FROM supplier_profiles sp WHERE sp.organization_id = p_supplier_org_id;
  IF v IS NULL THEN RAISE EXCEPTION 'no commission rate for supplier %', p_supplier_org_id; END IF;
  RETURN v;
END $$;--> statement-breakpoint

-- Derived order status + payment status (money-rules.md §5–6; the payment rule is the one in money.ts paymentStatus()):
--   due  = Σ gross of the NON-cancelled PLATFORM sub-orders;   paid = Σ receipts − Σ refunds
--   paid > due → refund_due · due = 0 → not_applicable · paid = due → paid · otherwise unpaid
-- Called by transition(), by the checkout and by payment recording, in the same transaction. Suppliers may trigger
-- it for orders containing their sub-order.
CREATE FUNCTION app.recompute_order(p_order_id uuid) RETURNS void
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
         coalesce(sum(gross_cents) FILTER (WHERE status <> 'cancelled' AND mode = 'platform'), 0)
    INTO v_total, v_cancelled, v_done, v_due
    FROM sub_orders WHERE order_id = p_order_id;
  SELECT coalesce(sum(CASE type WHEN 'receipt' THEN amount_cents ELSE -amount_cents END), 0)
    INTO v_paid FROM order_payments WHERE order_id = p_order_id;

  v_status := CASE WHEN v_cancelled = v_total THEN 'cancelled' WHEN v_done = v_total THEN 'completed' ELSE 'in_progress' END;
  v_pay := CASE WHEN v_paid > v_due THEN 'refund_due' WHEN v_due = 0 THEN 'not_applicable'
                WHEN v_paid = v_due THEN 'paid' ELSE 'unpaid' END;

  UPDATE orders SET status = v_status, payment_status = v_pay WHERE id = p_order_id;
  UPDATE sub_orders SET order_payment_status = v_pay WHERE order_id = p_order_id;
END $$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app.next_invoice_number(), app.resolve_commission_bps(text), app.recompute_order(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.next_invoice_number(), app.resolve_commission_bps(text), app.recompute_order(uuid) TO horeca_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.recompute_order(uuid) TO horeca_worker;
