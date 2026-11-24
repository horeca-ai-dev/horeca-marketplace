-- RLS integration tests for rls.sql (run after the Drizzle migration + rls.sql, as a superuser).
-- Every block switches to the app (or worker) role and sets the actor context exactly like withTx() does.
-- expect_fail: passes only if the statement raises. expect_eq: compares a value.
\set ON_ERROR_STOP 1
SET client_min_messages = notice;

CREATE OR REPLACE FUNCTION public.expect_fail(label text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE stmt; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OK   (rejected) %  [%]', label, left(SQLERRM, 70); RETURN; END;
  RAISE EXCEPTION 'FAIL (allowed, must be rejected) %', label;
END $$;
CREATE OR REPLACE FUNCTION public.expect_eq(label text, got anyelement, want anyelement) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN RAISE EXCEPTION 'FAIL % — got %, want %', label, got, want; END IF;
  RAISE NOTICE 'OK   %', label;
END $$;
CREATE OR REPLACE FUNCTION public.rows_affected(stmt text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN EXECUTE stmt; GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$;
-- actor(): what withTx(actor) does at the start of each transaction.
CREATE OR REPLACE FUNCTION public.actor(u text, o text, t text, r text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('app.user_id', u, true), set_config('app.org_id', o, true),
         set_config('app.org_type', t, true), set_config('app.role', r, true);
$$;
GRANT EXECUTE ON FUNCTION public.expect_fail(text, text), public.expect_eq(text, anyelement, anyelement),
  public.actor(text, text, text, text), public.rows_affected(text) TO horeca_app, horeca_worker;

-- ───────────── seed (as owner — RLS bypassed) ─────────────
INSERT INTO "user" (id, email, name) VALUES
 ('u-admin', 'admin@demo.local', 'Admin'), ('u-a-owner', 'supplier-a@demo.local', 'A owner'),
 ('u-a-member', 'a-member@demo.local', 'A member'), ('u-b-owner', 'supplier-b@demo.local', 'B owner'),
 ('u-p-owner', 'supplier-p@demo.local', 'P owner'), ('u-hotel', 'buyer-hotel@demo.local', 'Hotel'),
 ('u-cafe', 'buyer-cafe@demo.local', 'Cafe');
INSERT INTO organization (id, name, slug) VALUES
 ('o-platform', 'Platform', 'platform'), ('o-sup-a', 'Supplier A', 'supplier-a'), ('o-sup-b', 'Supplier B', 'supplier-b'),
 ('o-sup-p', 'Supplier P (pending)', 'supplier-p'), ('o-hotel', 'Hotel Main', 'hotel-main'), ('o-cafe', 'Cafe Luna', 'cafe-luna');
INSERT INTO org_profiles (organization_id, type, status, legal_name, tax_id, address_line, city, postal_code, contact_email) VALUES
 ('o-platform', 'platform', 'approved', 'HoReCa Marketplace d.o.o.', '03000000', 'Ul. 1', 'Podgorica', '81000', 'p@demo.local'),
 ('o-sup-a', 'supplier', 'approved', 'Supplier A d.o.o.', '02000001', 'Ul. 2', 'Podgorica', '81000', 'a@demo.local'),
 ('o-sup-b', 'supplier', 'approved', 'Supplier B d.o.o.', '02000002', 'Ul. 3', 'Bar', '85000', 'b@demo.local'),
 ('o-sup-p', 'supplier', 'pending',  'Supplier P d.o.o.', '02000003', 'Ul. 4', 'Budva', '85310', 'pp@demo.local'),
 ('o-hotel', 'buyer', 'approved', 'Hotel Main d.o.o.', '03000001', 'Obala 1', 'Budva', '85310', 'h@demo.local'),
 ('o-cafe',  'buyer', 'approved', 'Cafe Luna d.o.o.',  '03000002', 'Trg 2', 'Kotor', '85330', 'c@demo.local');
INSERT INTO supplier_profiles (organization_id, iban, commission_override_bps) VALUES
 ('o-sup-a', 'ME25510000000000000001', NULL), ('o-sup-b', 'ME25510000000000000002', 650), ('o-sup-p', NULL, NULL);
INSERT INTO buyer_locations (id, organization_id, label, address_line, city, postal_code, is_default) VALUES
 ('11111111-0000-0000-0000-000000000001', 'o-hotel', 'Hotel Main', 'Obala 1', 'Budva', '85310', true);
INSERT INTO settings (key, value) VALUES ('default_commission_bps', '800'),
 ('platform_company', '{"legal_name":"HoReCa Marketplace d.o.o.","tax_id":"03000000","iban":"ME25510000000000000999"}');
INSERT INTO categories (id, parent_id, path, slug, name, depth) VALUES
 ('22222222-0000-0000-0000-000000000001', NULL, 'refrigeration', 'refrigeration', 'Refrigeration', 1),
 ('22222222-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'refrigeration.under_counter', 'under-counter-fridges', 'Under-counter fridges', 2);
INSERT INTO products (id, supplier_org_id, category_id, sku, name, base_price_cents, vat_rate_bps, status, attributes) VALUES
 ('33333333-0000-0000-0000-00000000000a', 'o-sup-a', '22222222-0000-0000-0000-000000000002', 'RF-150', 'Under-counter fridge 150 l', 48900, 2100, 'active', '{"capacity_l":150}'),
 ('33333333-0000-0000-0000-0000000000ad', 'o-sup-a', '22222222-0000-0000-0000-000000000002', 'RF-200', 'Draft fridge', 74900, 2100, 'draft', '{}'),
 ('33333333-0000-0000-0000-00000000000b', 'o-sup-b', '22222222-0000-0000-0000-000000000002', 'FC-140', 'Glass-door fridge 140 l', 45500, 2100, 'active', '{}'),
 ('33333333-0000-0000-0000-00000000000f', 'o-sup-p', '22222222-0000-0000-0000-000000000002', 'HS-130', 'Pending supplier fridge', 51200, 2100, 'active', '{}');
INSERT INTO carts (id, buyer_org_id) VALUES ('44444444-0000-0000-0000-000000000001', 'o-hotel');
INSERT INTO cart_items (cart_id, buyer_org_id, product_id, quantity, unit_price_cents_seen, added_by_user_id) VALUES
 ('44444444-0000-0000-0000-000000000001', 'o-hotel', '33333333-0000-0000-0000-00000000000a', 2, 48900, 'u-hotel'),
 ('44444444-0000-0000-0000-000000000001', 'o-hotel', '33333333-0000-0000-0000-00000000000b', 1, 45500, 'u-hotel');

-- ═════════════ 1. No context → nothing ═════════════
BEGIN; SET LOCAL ROLE horeca_app;
SELECT expect_eq('no actor: products invisible', (SELECT count(*) FROM products), 0::bigint);
SELECT expect_eq('no actor: categories invisible', (SELECT count(*) FROM categories), 0::bigint);
SELECT expect_eq('no actor: org profiles invisible', (SELECT count(*) FROM org_profiles), 0::bigint);
ROLLBACK;

-- ═════════════ 2. Catalogue visibility ═════════════
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'owner');
SELECT expect_eq('buyer sees only active products of approved suppliers (A active, B active)',
  (SELECT string_agg(sku, ',' ORDER BY sku) FROM products), 'FC-140,RF-150');
SELECT expect_eq('buyer sees approved suppliers + itself, not the pending supplier',
  (SELECT string_agg(organization_id, ',' ORDER BY organization_id) FROM org_profiles), 'o-hotel,o-sup-a,o-sup-b');
SELECT expect_eq('buyer cannot read supplier bank details', (SELECT count(*) FROM supplier_profiles), 0::bigint);
SELECT expect_fail('buyer cannot create a category',
  $$INSERT INTO categories (parent_id, path, slug, name, depth) VALUES (NULL, 'x', 'x', 'X', 1)$$);
SELECT expect_eq('buyer cannot change the default commission (UPDATE touches 0 rows)',
  rows_affected($q$UPDATE settings SET value = '1' WHERE key = 'default_commission_bps'$q$), 0::bigint);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-a-owner', 'o-sup-a', 'supplier', 'owner');
SELECT expect_eq('supplier A sees own draft + active and B active, not the pending supplier''s product',
  (SELECT string_agg(sku, ',' ORDER BY sku) FROM products), 'FC-140,RF-150,RF-200');
SELECT expect_eq('supplier A cannot update supplier B''s product (0 rows)',
  rows_affected($q$UPDATE products SET name = 'hacked' WHERE sku = 'FC-140'$q$), 0::bigint);
SELECT expect_eq('supplier A updates its own product', rows_affected($q$UPDATE products SET name = 'Fridge 150 l' WHERE sku = 'RF-150' AND supplier_org_id = 'o-sup-a'$q$), 1::bigint);
SELECT expect_fail('supplier A cannot create a product for supplier B',
  $$INSERT INTO products (supplier_org_id, category_id, sku, name, base_price_cents, vat_rate_bps)
    VALUES ('o-sup-b', '22222222-0000-0000-0000-000000000002', 'X-1', 'x', 100, 2100)$$);
SELECT expect_fail('supplier A cannot set its own commission override',
  $$UPDATE supplier_profiles SET commission_override_bps = 100 WHERE organization_id = 'o-sup-a'$$);
SELECT expect_fail('supplier A cannot approve / change its own status',
  $$UPDATE org_profiles SET status = 'suspended' WHERE organization_id = 'o-sup-a'$$);
SELECT expect_fail('supplier A cannot change its tax ID', $$UPDATE org_profiles SET tax_id = '09999999' WHERE organization_id = 'o-sup-a'$$);
SELECT expect_eq('supplier A owner may change legal data',
  rows_affected($q$UPDATE org_profiles SET legal_name = 'Supplier A doo' WHERE organization_id = 'o-sup-a'$q$), 1::bigint);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-p-owner', 'o-sup-p', 'supplier', 'owner');
SELECT expect_eq('pending supplier builds its catalogue (sees + edits own product)',
  rows_affected($q$UPDATE products SET name = 'Fridge 130 l' WHERE sku = 'HS-130'$q$), 1::bigint);
ROLLBACK;

-- ═════════════ 3. Checkout as the buyer, under RLS (the legitimate path must work) ═════════════
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'member');
SELECT expect_eq('commission for A resolves to platform default 800', app.resolve_commission_bps('o-sup-a'), 800);
SELECT expect_eq('commission for B resolves to override 650', app.resolve_commission_bps('o-sup-b'), 650);
-- lock + revalidate (FOR SHARE needs only SELECT through RLS)
SELECT expect_eq('cart lines locked', (SELECT count(*) FROM (SELECT 1 FROM cart_items FOR UPDATE) x), 2::bigint);
INSERT INTO orders (id, number, buyer_org_id, placed_by_user_id, idempotency_key, request_hash, payment_method,
                    buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents)
VALUES ('55555555-0000-0000-0000-000000000001', 'ORD-2026-' || lpad(nextval('order_number_seq')::text, 6, '0'), 'o-hotel', 'u-hotel',
        'idem-1', 'h1', 'proforma', '{}', '{}', 143300, 30093, 173393);
INSERT INTO sub_orders (id, order_id, number, buyer_org_id, supplier_org_id, buyer_snapshot, delivery_snapshot,
                        net_cents, vat_cents, gross_cents, commission_bps, commission_cents) VALUES
 ('66666666-0000-0000-0000-00000000000a', '55555555-0000-0000-0000-000000000001', 'ORD-2026-000001-1', 'o-hotel', 'o-sup-a', '{}', '{}', 97800, 20538, 118338, 800, 7824),
 ('66666666-0000-0000-0000-00000000000b', '55555555-0000-0000-0000-000000000001', 'ORD-2026-000001-2', 'o-hotel', 'o-sup-b', '{}', '{}', 45500, 9555, 55055, 650, 2958);
INSERT INTO order_lines (sub_order_id, buyer_org_id, supplier_org_id, product_id, position, sku, name, unit,
                         unit_price_cents, quantity, vat_rate_bps, line_net_cents, line_vat_cents, line_gross_cents) VALUES
 ('66666666-0000-0000-0000-00000000000a', 'o-hotel', 'o-sup-a', '33333333-0000-0000-0000-00000000000a', 1, 'RF-150', 'Fridge 150 l', 'piece', 48900, 2, 2100, 97800, 20538, 118338),
 ('66666666-0000-0000-0000-00000000000b', 'o-hotel', 'o-sup-b', '33333333-0000-0000-0000-00000000000b', 1, 'FC-140', 'Fridge 140 l', 'piece', 45500, 1, 2100, 45500, 9555, 55055);
INSERT INTO sub_order_events (sub_order_id, buyer_org_id, supplier_org_id, from_status, to_status, actor_user_id, actor_org_id) VALUES
 ('66666666-0000-0000-0000-00000000000a', 'o-hotel', 'o-sup-a', NULL, 'pending', 'u-hotel', 'o-hotel'),
 ('66666666-0000-0000-0000-00000000000b', 'o-hotel', 'o-sup-b', NULL, 'pending', 'u-hotel', 'o-hotel');
INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id) VALUES
 ('o-sup-a', '66666666-0000-0000-0000-00000000000a', 'sale', 118338, 'sale', 'u-hotel'),
 ('o-sup-a', '66666666-0000-0000-0000-00000000000a', 'commission', -7824, 'commission 8 %', 'u-hotel'),
 ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'sale', 55055, 'sale', 'u-hotel'),
 ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'commission', -2958, 'commission 6.5 %', 'u-hotel');
INSERT INTO proforma_invoices (order_id, buyer_org_id, number, issuer_snapshot, buyer_snapshot, content_snapshot, vat_breakdown,
                               net_cents, vat_cents, gross_cents, due_date, payment_reference)
VALUES ('55555555-0000-0000-0000-000000000001', 'o-hotel', app.next_invoice_number(), '{}', '{}', '{}', '[]', 143300, 30093, 173393, current_date + 3, 'PF-ref');
DELETE FROM cart_items;
SELECT expect_eq('invoice number is PF-<year>-000001', (SELECT number FROM proforma_invoices), format('PF-%s-000001', extract(year FROM now())));
SELECT expect_eq('buyer cannot read the ledger it just wrote', (SELECT count(*) FROM ledger_entries), 0::bigint);
SELECT expect_fail('same idempotency key twice in the same org',
  $$INSERT INTO orders (number, buyer_org_id, placed_by_user_id, idempotency_key, request_hash, payment_method, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents)
    VALUES ('ORD-X', 'o-hotel', 'u-hotel', 'idem-1', 'h1', 'proforma', '{}', '{}', 0, 0, 0)$$);
SELECT expect_fail('buyer cannot book an adjustment (platform only)',
  $$INSERT INTO ledger_entries (supplier_org_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-a', 'adjustment', 999, 'x', 'u-hotel')$$);
SELECT expect_fail('buyer cannot issue invoice version 2 itself',
  $$INSERT INTO proforma_invoices (order_id, buyer_org_id, version, number, issuer_snapshot, buyer_snapshot, content_snapshot, vat_breakdown, net_cents, vat_cents, gross_cents, due_date, payment_reference)
    VALUES ('55555555-0000-0000-0000-000000000001', 'o-hotel', 2, 'PF-X/2', '{}', '{}', '{}', '[]', 0, 0, 0, current_date, 'x')$$);
SELECT expect_fail('direct access to the invoice counter', $$UPDATE invoice_counters SET last_value = 0$$);
SELECT expect_fail('buyer cannot update the order (status is derived)', $$UPDATE orders SET status = 'completed'$$);
COMMIT;

-- Duplicate sale (retry / double click) and wrong-amount sale, in fresh transactions.
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'member');
SELECT expect_fail('a sale with a wrong amount is rejected',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'sale', 999, 'x', 'u-hotel')$$);
SELECT expect_fail('the same sale cannot be booked twice for a sub-order',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-a', '66666666-0000-0000-0000-00000000000a', 'sale', 118338, 'retry', 'u-hotel')$$);
ROLLBACK;

-- Rollback leaves no gap: a failed checkout's invoice number is reused.
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'member');
SELECT expect_eq('next number inside a transaction that will roll back', app.next_invoice_number(), format('PF-%s-000002', extract(year FROM now())));
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'member');
SELECT expect_eq('after rollback the same number is issued again (gapless)', app.next_invoice_number(), format('PF-%s-000002', extract(year FROM now())));
ROLLBACK;

-- ═════════════ 4. Tenant isolation on orders ═════════════
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-cafe', 'o-cafe', 'buyer', 'owner');
SELECT expect_eq('buyer B sees none of buyer A''s orders', (SELECT count(*) FROM orders), 0::bigint);
SELECT expect_eq('buyer B sees none of buyer A''s sub-orders', (SELECT count(*) FROM sub_orders), 0::bigint);
SELECT expect_eq('buyer B sees none of buyer A''s lines', (SELECT count(*) FROM order_lines), 0::bigint);
SELECT expect_eq('buyer B sees none of buyer A''s invoices', (SELECT count(*) FROM proforma_invoices), 0::bigint);
SELECT expect_fail('buyer B cannot recompute buyer A''s order', $$SELECT app.recompute_order('55555555-0000-0000-0000-000000000001')$$);
SELECT expect_fail('buyer B cannot book a sale on buyer A''s sub-order',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-a', '66666666-0000-0000-0000-00000000000a', 'sale', 118338, 'x', 'u-cafe')$$);
SELECT expect_fail('buyer B cannot add lines to buyer A''s sub-order',
  $$INSERT INTO order_lines (sub_order_id, buyer_org_id, supplier_org_id, product_id, position, sku, name, unit, unit_price_cents, quantity, vat_rate_bps, line_net_cents, line_vat_cents, line_gross_cents)
    VALUES ('66666666-0000-0000-0000-00000000000a', 'o-cafe', 'o-sup-a', '33333333-0000-0000-0000-00000000000a', 9, 'x', 'x', 'piece', 1, 1, 0, 1, 0, 1)$$);
SELECT expect_eq('the same idempotency key in ANOTHER org creates its own order (no leak)',
  rows_affected($q$INSERT INTO orders (number, buyer_org_id, placed_by_user_id, idempotency_key, request_hash, payment_method, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents)
              VALUES ('ORD-C-1', 'o-cafe', 'u-cafe', 'idem-1', 'h9', 'proforma', '{}', '{}', 0, 0, 0)$q$), 1::bigint);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-a-owner', 'o-sup-a', 'supplier', 'owner');
SELECT expect_eq('supplier A sees only its own sub-order', (SELECT string_agg(number, ',') FROM sub_orders), 'ORD-2026-000001-1');
SELECT expect_eq('supplier A sees only its own lines', (SELECT string_agg(sku, ',') FROM order_lines), 'RF-150');
SELECT expect_eq('supplier never reads the buyer''s orders row (other suppliers'' totals)', (SELECT count(*) FROM orders), 0::bigint);
SELECT expect_eq('supplier cannot download the pro-forma (lists other suppliers)', (SELECT count(*) FROM proforma_invoices), 0::bigint);
SELECT expect_eq('supplier A owner reads own ledger: 118338 − 7824', (SELECT sum(amount_cents) FROM ledger_entries), 110514::numeric);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-a-member', 'o-sup-a', 'supplier', 'member');
SELECT expect_eq('supplier MEMBER cannot read the ledger (owner-only)', (SELECT count(*) FROM ledger_entries), 0::bigint);
SELECT expect_eq('supplier MEMBER cannot read IBAN', (SELECT count(*) FROM supplier_profiles), 0::bigint);
SELECT expect_eq('supplier member still sees its sub-orders', (SELECT count(*) FROM sub_orders), 1::bigint);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-b-owner', 'o-sup-b', 'supplier', 'owner');
SELECT expect_eq('supplier B ledger contains only B', (SELECT string_agg(DISTINCT supplier_org_id, ',') FROM ledger_entries), 'o-sup-b');
SELECT expect_eq('supplier B cannot ship supplier A''s sub-order (0 rows)',
  rows_affected($q$UPDATE sub_orders SET status = 'shipped' WHERE number = 'ORD-2026-000001-1'$q$), 0::bigint);
ROLLBACK;

-- ═════════════ 5. Transitions, cancellation and reversals ═════════════
-- Buyer may cancel a pending sub-order but never move it forward.
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'member');
SELECT expect_fail('buyer cannot mark its sub-order shipped',
  $$UPDATE sub_orders SET status = 'shipped' WHERE id = '66666666-0000-0000-0000-00000000000b'$$);
UPDATE sub_orders SET status = 'cancelled', cancel_reason = 'ordered by mistake', cancelled_by_user_id = 'u-hotel'
 WHERE id = '66666666-0000-0000-0000-00000000000b';
INSERT INTO sub_order_events (sub_order_id, buyer_org_id, supplier_org_id, from_status, to_status, actor_user_id, actor_org_id)
VALUES ('66666666-0000-0000-0000-00000000000b', 'o-hotel', 'o-sup-b', 'pending', 'cancelled', 'u-hotel', 'o-hotel');
SELECT expect_fail('reversal with a wrong amount is rejected',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'sale_reversal', -1, 'x', 'u-hotel')$$);
INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id) VALUES
 ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'sale_reversal', -55055, 'cancelled by buyer', 'u-hotel'),
 ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'commission_reversal', 2958, 'cancelled by buyer', 'u-hotel');
SELECT app.recompute_order('55555555-0000-0000-0000-000000000001');
SELECT expect_eq('order stays in_progress (A still pending)', (SELECT status::text FROM orders), 'in_progress');
COMMIT;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-b-owner', 'o-sup-b', 'supplier', 'owner');
SELECT expect_eq('supplier B balance is 0 after the reversal', (SELECT sum(amount_cents) FROM ledger_entries), 0::numeric);
SELECT expect_fail('a cancelled sub-order cannot be booked again (one reversal each)',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'sale_reversal', -55055, 'again', 'u-b-owner')$$);
ROLLBACK;

-- Supplier A fulfils its sub-order.
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-a-member', 'o-sup-a', 'supplier', 'member');
UPDATE sub_orders SET status = 'confirmed' WHERE id = '66666666-0000-0000-0000-00000000000a';
UPDATE sub_orders SET status = 'shipped'   WHERE id = '66666666-0000-0000-0000-00000000000a';
UPDATE sub_orders SET status = 'delivered' WHERE id = '66666666-0000-0000-0000-00000000000a';
INSERT INTO sub_order_events (sub_order_id, buyer_org_id, supplier_org_id, from_status, to_status, actor_user_id, actor_org_id)
VALUES ('66666666-0000-0000-0000-00000000000a', 'o-hotel', 'o-sup-a', 'shipped', 'delivered', 'u-a-member', 'o-sup-a');
SELECT expect_fail('event must match the current status (no forged history)',
  $$INSERT INTO sub_order_events (sub_order_id, buyer_org_id, supplier_org_id, from_status, to_status, actor_user_id, actor_org_id)
    VALUES ('66666666-0000-0000-0000-00000000000a', 'o-hotel', 'o-sup-a', 'pending', 'cancelled', 'u-a-member', 'o-sup-a')$$);
SELECT expect_fail('event cannot name a different supplier',
  $$INSERT INTO sub_order_events (sub_order_id, buyer_org_id, supplier_org_id, from_status, to_status, actor_user_id, actor_org_id)
    VALUES ('66666666-0000-0000-0000-00000000000a', 'o-hotel', 'o-sup-b', 'shipped', 'delivered', 'u-a-member', 'o-sup-a')$$);
SELECT app.recompute_order('55555555-0000-0000-0000-000000000001');
COMMIT;

-- ═════════════ 6. Platform: payments, payouts, moderation, suspension ═════════════
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-admin', 'o-platform', 'platform', 'owner');
SELECT expect_eq('order completed (A delivered, B cancelled)', (SELECT status::text FROM orders WHERE id = '55555555-0000-0000-0000-000000000001'), 'completed');
SELECT expect_eq('platform sees every order', (SELECT count(*) FROM orders), 1::bigint);
INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, bank_reference, recorded_by_user_id)
VALUES ('55555555-0000-0000-0000-000000000001', 'o-hotel', 'receipt', 173393, 'IZV-77', 'u-admin');
SELECT app.recompute_order('55555555-0000-0000-0000-000000000001');
SELECT expect_eq('paid the full original invoice after B was cancelled → refund_due', (SELECT payment_status::text FROM orders), 'refund_due');
INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, bank_reference, recorded_by_user_id)
VALUES ('55555555-0000-0000-0000-000000000001', 'o-hotel', 'refund', 55055, 'NAL-1', 'u-admin');
SELECT app.recompute_order('55555555-0000-0000-0000-000000000001');
SELECT expect_eq('after the refund → paid', (SELECT payment_status::text FROM orders), 'paid');
SELECT expect_eq('supplier copy of the payment status follows', (SELECT string_agg(DISTINCT order_payment_status::text, ',') FROM sub_orders), 'paid');
SELECT expect_fail('recorded payments are immutable', $$UPDATE order_payments SET amount_cents = 1$$);
INSERT INTO ledger_entries (supplier_org_id, type, amount_cents, description, reference, created_by_user_id)
VALUES ('o-sup-a', 'payout', -110514, 'payout', 'NAL-2', 'u-admin');
SELECT expect_eq('supplier A balance after payout = 0', (SELECT sum(amount_cents) FROM ledger_entries WHERE supplier_org_id = 'o-sup-a'), 0::numeric);
SELECT expect_fail('ledger is append-only: UPDATE', $$UPDATE ledger_entries SET amount_cents = 1$$);
SELECT expect_fail('ledger is append-only: DELETE', $$DELETE FROM ledger_entries$$);
SELECT expect_fail('platform cannot book a sale (only payout/adjustment)',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-a', '66666666-0000-0000-0000-00000000000a', 'sale', 1, 'x', 'u-admin')$$);
UPDATE supplier_profiles SET commission_override_bps = 700 WHERE organization_id = 'o-sup-a';
UPDATE org_profiles SET status = 'suspended', status_changed_by = 'u-admin' WHERE organization_id = 'o-sup-a';
INSERT INTO audit_log (actor_user_id, actor_org_id, actor_org_type, action, entity_type, entity_id)
VALUES ('u-admin', 'o-platform', 'platform', 'supplier.suspend', 'organization', 'o-sup-a');
SELECT expect_eq('platform reads the audit log', (SELECT count(*) FROM audit_log), 1::bigint);
COMMIT;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'owner');
SELECT expect_eq('suspended supplier''s products disappear from the catalogue immediately',
  (SELECT string_agg(sku, ',') FROM products), 'FC-140');
SELECT expect_eq('buyer cannot read the audit log', (SELECT count(*) FROM audit_log), 0::bigint);
SELECT expect_fail('buyer cannot write an audit entry in another org''s name',
  $$INSERT INTO audit_log (actor_user_id, actor_org_id, actor_org_type, action, entity_type, entity_id) VALUES ('u-hotel', 'o-platform', 'platform', 'x', 'x', 'x')$$);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-a-owner', 'o-sup-a', 'supplier', 'owner');
SELECT expect_eq('suspended supplier cannot edit products (0 rows)',
  rows_affected($q$UPDATE products SET name = 'x' WHERE supplier_org_id = 'o-sup-a'$q$), 0::bigint);
SELECT expect_eq('suspended supplier still reads its sub-orders', (SELECT count(*) FROM sub_orders), 1::bigint);
SELECT expect_eq('suspended supplier still reads its ledger', (SELECT count(*) FROM ledger_entries) > 0, true);
ROLLBACK;

-- ═════════════ 7. Worker (system context) ═════════════
BEGIN; SET LOCAL ROLE horeca_worker;
SELECT expect_eq('worker reads every product (search sync)', (SELECT count(*) FROM products), 4::bigint);
SELECT expect_eq('worker stores the rendered PDF key',
  rows_affected($q$UPDATE proforma_invoices SET storage_key = 'invoices/pf-1.pdf', pdf_generated_at = now()$q$), 1::bigint);
SELECT expect_fail('worker cannot change prices', $$UPDATE products SET base_price_cents = 1$$);
SELECT expect_fail('worker cannot write the ledger', $$INSERT INTO ledger_entries (supplier_org_id, type, amount_cents, description) VALUES ('o-sup-a', 'adjustment', 1, 'x')$$);
SELECT expect_fail('worker cannot change invoice amounts', $$UPDATE proforma_invoices SET gross_cents = 1$$);
ROLLBACK;

SELECT 'ALL RLS TESTS PASSED' AS result;
