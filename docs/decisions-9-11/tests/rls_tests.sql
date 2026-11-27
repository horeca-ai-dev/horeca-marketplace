-- RLS integration tests for migrations 0005 (RLS), 0006 (D5-B0: contracts, payments, stock, system cancel) and 0007 (member read of org_profiles); run after ALL migrations, as the superuser.
-- Edited for D4-B2 exactly as docs/decisions-9-11/APPLIED.md lists (decision 012, invoice sequence, no thumb_key,
-- checkout locking); run by scripts/test-rls.sh against the real migrations — never by run_db_tests.sh.
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

-- ───────────── seed (as the superuser — RLS bypassed) ─────────────
INSERT INTO "user" (id, email, name) VALUES
 ('u-admin', 'admin@demo.local', 'Admin'), ('u-a-owner', 'supplier-a@demo.local', 'A owner'),
 ('u-a-member', 'a-member@demo.local', 'A member'), ('u-b-owner', 'supplier-b@demo.local', 'B owner'),
 ('u-p-owner', 'supplier-p@demo.local', 'P owner'), ('u-r-owner', 'supplier-r@demo.local', 'R owner'),
 ('u-hotel', 'buyer-hotel@demo.local', 'Hotel'), ('u-cafe', 'buyer-cafe@demo.local', 'Cafe'),
 ('u-new', 'new@demo.local', 'New user');
-- Better Auth: organization.created_at has no default.
INSERT INTO organization (id, name, slug, created_at) VALUES
 ('o-platform', 'Platform', 'platform', now()), ('o-sup-a', 'Supplier A', 'supplier-a', now()),
 ('o-sup-b', 'Supplier B', 'supplier-b', now()), ('o-sup-p', 'Supplier P (pending)', 'supplier-p', now()),
 ('o-sup-r', 'Supplier R (rejected)', 'supplier-r', now()), ('o-sup-n', 'Supplier N (no profile yet)', 'supplier-n', now()),
 ('o-hotel', 'Hotel Main', 'hotel-main', now()), ('o-cafe', 'Cafe Luna', 'cafe-luna', now()),
 ('o-new', 'New Buyer (no profile yet)', 'new-buyer', now());
INSERT INTO org_profiles (organization_id, type, status, legal_name, tax_id, address_line, city, postal_code, contact_email, rejection_reason) VALUES
 ('o-platform', 'platform', 'approved', 'HoReCa Marketplace d.o.o.', '03000000', 'Ul. 1', 'Podgorica', '81000', 'p@demo.local', NULL),
 ('o-sup-a', 'supplier', 'approved', 'Supplier A d.o.o.', '02000001', 'Ul. 2', 'Podgorica', '81000', 'a@demo.local', NULL),
 ('o-sup-b', 'supplier', 'approved', 'Supplier B d.o.o.', '02000002', 'Ul. 3', 'Bar', '85000', 'b@demo.local', NULL),
 ('o-sup-p', 'supplier', 'pending',  'Supplier P d.o.o.', '02000003', 'Ul. 4', 'Budva', '85310', 'pp@demo.local', NULL),
 ('o-sup-r', 'supplier', 'rejected', 'Supplier R d.o.o.', '02000004', 'Ul. 5', 'Nikšić', '81400', 'r@demo.local', 'documents missing'),
 ('o-hotel', 'buyer', 'approved', 'Hotel Main d.o.o.', '03000001', 'Obala 1', 'Budva', '85310', 'h@demo.local', NULL),
 ('o-cafe',  'buyer', 'approved', 'Cafe Luna d.o.o.',  '03000002', 'Trg 2', 'Kotor', '85330', 'c@demo.local', NULL);
-- (The pending and rejected suppliers exist as legacy rows: after decision 012 nothing creates them any more.)
INSERT INTO supplier_profiles (organization_id, iban, commission_override_bps) VALUES
 ('o-sup-a', 'ME25510000000000000001', NULL), ('o-sup-b', 'ME25510000000000000002', 650), ('o-sup-p', NULL, NULL);
-- D5-B0: a `direct` sub-order needs an active contract (sub_orders_insert), so the pairs the direct-mode checks below use have one.
INSERT INTO supplier_agreements (buyer_org_id, supplier_org_id, status, requested_by_user_id, decided_by_user_id, decided_at) VALUES
 ('o-hotel', 'o-sup-b', 'active', 'u-hotel', 'u-b-owner', now()), ('o-cafe', 'o-sup-b', 'active', 'u-cafe', 'u-b-owner', now());
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
SELECT expect_eq('no actor: settings invisible', (SELECT count(*) FROM settings), 0::bigint);
ROLLBACK;

-- ═════════════ 2. Catalogue visibility ═════════════
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'owner');
SELECT expect_eq('buyer sees only active products of approved suppliers (A active, B active)',
  (SELECT string_agg(sku, ',' ORDER BY sku) FROM products), 'FC-140,RF-150');
SELECT expect_eq('buyer sees approved suppliers + itself, not the pending or rejected supplier',
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
SELECT expect_eq('a legacy pending supplier still builds its catalogue (sees + edits own product)',
  rows_affected($q$UPDATE products SET name = 'Fridge 130 l' WHERE sku = 'HS-130'$q$), 1::bigint);
ROLLBACK;

-- ═════════════ 2b. Identity: who may create a supplier (decision 012, APPLIED.md §4 · D4-B2) ═════════════
-- Registration (buyer only): the new user acts for the organization just created and inserts its own profile.
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-new', 'o-new', 'buyer', 'owner');
SELECT expect_eq('registration: a buyer inserts its own approved profile',
  rows_affected($q$INSERT INTO org_profiles (organization_id, type, status, legal_name, tax_id, address_line, city, postal_code, contact_email)
                   VALUES ('o-new', 'buyer', 'approved', 'New Buyer d.o.o.', '03000009', 'Ul. 9', 'Bar', '85000', 'n@demo.local')$q$), 1::bigint);
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-new', 'o-new', 'buyer', 'owner');
SELECT expect_fail('public registration cannot insert a supplier profile (buyer context)',
  $$INSERT INTO org_profiles (organization_id, type, status, legal_name, tax_id, address_line, city, postal_code, contact_email)
    VALUES ('o-new', 'supplier', 'approved', 'Sneaky d.o.o.', '02000009', 'Ul. 9', 'Bar', '85000', 'n@demo.local')$$);
SELECT expect_fail('a buyer cannot insert a profile for another organization',
  $$INSERT INTO org_profiles (organization_id, type, status, legal_name, tax_id, address_line, city, postal_code, contact_email)
    VALUES ('o-sup-n', 'buyer', 'approved', 'Other d.o.o.', '03000008', 'Ul. 9', 'Bar', '85000', 'n@demo.local')$$);
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-new', 'o-sup-n', 'supplier', 'owner');
SELECT expect_fail('a supplier-context user cannot insert a supplier profile for itself (guard)',
  $$INSERT INTO org_profiles (organization_id, type, status, legal_name, tax_id, address_line, city, postal_code, contact_email)
    VALUES ('o-sup-n', 'supplier', 'approved', 'Self-made d.o.o.', '02000010', 'Ul. 9', 'Bar', '85000', 'n@demo.local')$$);
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-admin', 'o-platform', 'platform', 'owner');
SELECT expect_fail('the platform cannot insert a supplier profile as pending',
  $$INSERT INTO org_profiles (organization_id, type, status, legal_name, tax_id, address_line, city, postal_code, contact_email)
    VALUES ('o-sup-n', 'supplier', 'pending', 'Supplier N d.o.o.', '02000011', 'Ul. 9', 'Bar', '85000', 'n@demo.local')$$);
SELECT expect_fail('nobody can create a platform organization through the app',
  $$INSERT INTO org_profiles (organization_id, type, status, legal_name, tax_id, address_line, city, postal_code, contact_email)
    VALUES ('o-sup-n', 'platform', 'approved', 'Second platform', '03000011', 'Ul. 9', 'Bar', '85000', 'n@demo.local')$$);
SELECT expect_eq('the platform inserts a supplier profile as approved',
  rows_affected($q$INSERT INTO org_profiles (organization_id, type, status, legal_name, tax_id, address_line, city, postal_code, contact_email)
                   VALUES ('o-sup-n', 'supplier', 'approved', 'Supplier N d.o.o.', '02000011', 'Ul. 9', 'Bar', '85000', 'n@demo.local')$q$), 1::bigint);
-- ... the new supplier's own owner tries to insert its supplier_profiles row (nothing exists yet, so only RLS can refuse):
SELECT actor('u-new', 'o-sup-n', 'supplier', 'owner');
SELECT expect_fail('a supplier cannot insert its own supplier_profiles row',
  $$INSERT INTO supplier_profiles (organization_id) VALUES ('o-sup-n')$$);
SELECT actor('u-admin', 'o-platform', 'platform', 'owner');
SELECT expect_eq('the platform inserts the supplier_profiles row (with a commission override)',
  rows_affected($q$INSERT INTO supplier_profiles (organization_id, commission_override_bps) VALUES ('o-sup-n', 500)$q$), 1::bigint);
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-r-owner', 'o-sup-r', 'supplier', 'owner');
SELECT expect_fail('a rejected supplier cannot re-apply: rejected → pending is refused',
  $$UPDATE org_profiles SET status = 'pending' WHERE organization_id = 'o-sup-r'$$);
ROLLBACK;

-- ═════════════ 3. Checkout as the buyer, under RLS (the legitimate path must work) ═════════════
-- Order O1 of the Hotel: sub-order A is bought on the PLATFORM (card), sub-order B DIRECTLY (under a contract).
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'member');
SELECT expect_eq('commission for A resolves to platform default 800', app.resolve_commission_bps('o-sup-a'), 800);
SELECT expect_eq('commission for B resolves to override 650', app.resolve_commission_bps('o-sup-b'), 650);
-- lock + revalidate: only cart_items is locked (FOR SHARE on products would return 0 rows under RLS)
SELECT expect_eq('cart lines locked', (SELECT count(*) FROM (SELECT 1 FROM cart_items FOR UPDATE) x), 2::bigint);
SELECT expect_eq('FOR SHARE on products returns 0 rows for a buyer (why we lock cart_items only)',
  (SELECT count(*) FROM (SELECT 1 FROM products FOR SHARE) x), 0::bigint);
INSERT INTO orders (id, number, buyer_org_id, placed_by_user_id, idempotency_key, request_hash,
                    buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents)
VALUES ('55555555-0000-0000-0000-000000000001', 'ORD-2026-' || lpad(nextval('order_number_seq')::text, 6, '0'), 'o-hotel', 'u-hotel',
        'idem-1', 'h1', '{}', '{}', 143300, 30093, 173393);
INSERT INTO sub_orders (id, order_id, number, buyer_org_id, supplier_org_id, mode, buyer_snapshot, delivery_snapshot,
                        net_cents, vat_cents, gross_cents, commission_bps, commission_cents) VALUES
 ('66666666-0000-0000-0000-00000000000a', '55555555-0000-0000-0000-000000000001', 'ORD-2026-000001-1', 'o-hotel', 'o-sup-a', 'platform', '{}', '{}', 97800, 20538, 118338, 800, 7824),
 ('66666666-0000-0000-0000-00000000000b', '55555555-0000-0000-0000-000000000001', 'ORD-2026-000001-2', 'o-hotel', 'o-sup-b', 'direct', '{}', '{}', 45500, 9555, 55055, 650, 2958);
INSERT INTO order_lines (sub_order_id, buyer_org_id, supplier_org_id, product_id, position, sku, name, unit,
                         unit_price_cents, quantity, vat_rate_bps, line_net_cents, line_vat_cents, line_gross_cents) VALUES
 ('66666666-0000-0000-0000-00000000000a', 'o-hotel', 'o-sup-a', '33333333-0000-0000-0000-00000000000a', 1, 'RF-150', 'Fridge 150 l', 'piece', 48900, 2, 2100, 97800, 20538, 118338),
 ('66666666-0000-0000-0000-00000000000b', 'o-hotel', 'o-sup-b', '33333333-0000-0000-0000-00000000000b', 1, 'FC-140', 'Fridge 140 l', 'piece', 45500, 1, 2100, 45500, 9555, 55055);
INSERT INTO sub_order_events (sub_order_id, buyer_org_id, supplier_org_id, from_status, to_status, actor_user_id, actor_org_id) VALUES
 ('66666666-0000-0000-0000-00000000000a', 'o-hotel', 'o-sup-a', NULL, 'pending', 'u-hotel', 'o-hotel'),
 ('66666666-0000-0000-0000-00000000000b', 'o-hotel', 'o-sup-b', NULL, 'pending', 'u-hotel', 'o-hotel');
-- Ledger by mode: platform = sale + commission; direct = commission only (the supplier received the money itself).
INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id) VALUES
 ('o-sup-a', '66666666-0000-0000-0000-00000000000a', 'sale', 118338, 'sale', 'u-hotel'),
 ('o-sup-a', '66666666-0000-0000-0000-00000000000a', 'commission', -7824, 'commission 8 %', 'u-hotel'),
 ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'commission', -2958, 'commission 6.5 %', 'u-hotel');
-- Pro-forma = the PLATFORM part only (sub-order A), not the order's 173393.
INSERT INTO proforma_invoices (order_id, buyer_org_id, number, issuer_snapshot, buyer_snapshot, content_snapshot, vat_breakdown,
                               net_cents, vat_cents, gross_cents, due_date, payment_reference)
VALUES ('55555555-0000-0000-0000-000000000001', 'o-hotel', app.next_invoice_number(), '{}', '{}', '{}', '[]', 97800, 20538, 118338, current_date + 8, 'PF-ref');
DELETE FROM cart_items;
SELECT app.recompute_order('55555555-0000-0000-0000-000000000001');
SELECT expect_eq('the order is in progress and unpaid (platform part 118338, nothing paid)',
  (SELECT status::text || '/' || payment_status::text FROM orders), 'in_progress/unpaid');
SELECT expect_eq('invoice number has the format PF-<year>-NNNNNN',
  (SELECT number ~ ('^PF-' || extract(year FROM now())::int || '-[0-9]{6}$') FROM proforma_invoices), true);
SELECT expect_eq('buyer cannot read the ledger it just wrote', (SELECT count(*) FROM ledger_entries), 0::bigint);
SELECT expect_fail('same idempotency key twice in the same org',
  $$INSERT INTO orders (number, buyer_org_id, placed_by_user_id, idempotency_key, request_hash, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents)
    VALUES ('ORD-X', 'o-hotel', 'u-hotel', 'idem-1', 'h1', '{}', '{}', 0, 0, 0)$$);
SELECT expect_fail('buyer cannot book an adjustment (platform only)',
  $$INSERT INTO ledger_entries (supplier_org_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-a', 'adjustment', 999, 'x', 'u-hotel')$$);
SELECT expect_fail('buyer cannot book a commission payment (platform only)',
  $$INSERT INTO ledger_entries (supplier_org_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-b', 'commission_payment', 2958, 'x', 'u-hotel')$$);
SELECT expect_fail('buyer cannot issue invoice version 2 itself',
  $$INSERT INTO proforma_invoices (order_id, buyer_org_id, version, number, issuer_snapshot, buyer_snapshot, content_snapshot, vat_breakdown, net_cents, vat_cents, gross_cents, due_date, payment_reference)
    VALUES ('55555555-0000-0000-0000-000000000001', 'o-hotel', 2, 'PF-X/2', '{}', '{}', '{}', '[]', 0, 0, 0, current_date, 'x')$$);
SELECT expect_fail('buyer cannot update the order (status is derived)', $$UPDATE orders SET status = 'completed'$$);
COMMIT;

-- Wrong or illegal ledger entries, a second invoice number, and fields the buyer must not choose — fresh transactions.
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'member');
SELECT expect_fail('a sale with a wrong amount is rejected',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-a', '66666666-0000-0000-0000-00000000000a', 'sale', 999, 'x', 'u-hotel')$$);
SELECT expect_fail('the same sale cannot be booked twice for a sub-order',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-a', '66666666-0000-0000-0000-00000000000a', 'sale', 118338, 'retry', 'u-hotel')$$);
SELECT expect_fail('a DIRECT sub-order books no sale (only its commission), even with the right amount',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'sale', 55055, 'x', 'u-hotel')$$);
SELECT expect_fail('the commission of a direct sub-order cannot be booked twice',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'commission', -2958, 'retry', 'u-hotel')$$);
ROLLBACK;

-- Invoice numbers come from a plain sequence: two checkouts get different numbers; a rolled-back one leaves a gap.
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'member');
SELECT expect_eq('two invoice numbers in a row differ', app.next_invoice_number() <> app.next_invoice_number(), true);
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-a-owner', 'o-sup-a', 'supplier', 'owner');
SELECT expect_fail('a supplier cannot ask for an invoice number', $$SELECT app.next_invoice_number()$$);
ROLLBACK;

-- Fields the buyer must not choose at checkout (each negative test has a positive control).
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'member');
SELECT expect_eq('control: a plain new order is accepted',
  rows_affected($q$INSERT INTO orders (id, number, buyer_org_id, placed_by_user_id, idempotency_key, request_hash, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents)
                   VALUES ('55555555-0000-0000-0000-0000000000a1', 'ORD-T-1', 'o-hotel', 'u-hotel', 'idem-t1', 'h', '{}', '{}', 0, 0, 0)$q$), 1::bigint);
SELECT expect_fail('a new order cannot start as paid',
  $$INSERT INTO orders (number, buyer_org_id, placed_by_user_id, idempotency_key, request_hash, payment_status, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents)
    VALUES ('ORD-T-2', 'o-hotel', 'u-hotel', 'idem-t2', 'h', 'paid', '{}', '{}', 0, 0, 0)$$);
SELECT expect_eq('control: a new sub-order (pending, unpaid, not yet submitted) is accepted',
  rows_affected($q$INSERT INTO sub_orders (order_id, number, buyer_org_id, supplier_org_id, mode, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents, commission_bps, commission_cents)
                   VALUES ('55555555-0000-0000-0000-0000000000a1', 'ORD-T-1-1', 'o-hotel', 'o-sup-a', 'platform', '{}', '{}', 0, 0, 0, 800, 0)$q$), 1::bigint);
SELECT expect_fail('a new sub-order cannot claim to be already accepted by the supplier',
  $$INSERT INTO sub_orders (order_id, number, buyer_org_id, supplier_org_id, mode, supplier_submission, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents, commission_bps, commission_cents)
    VALUES ('55555555-0000-0000-0000-0000000000a1', 'ORD-T-1-2', 'o-hotel', 'o-sup-b', 'direct', 'accepted', '{}', '{}', 0, 0, 0, 800, 0)$$);
SELECT expect_fail('a new sub-order cannot claim to be paid',
  $$INSERT INTO sub_orders (order_id, number, buyer_org_id, supplier_org_id, mode, order_payment_status, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents, commission_bps, commission_cents)
    VALUES ('55555555-0000-0000-0000-0000000000a1', 'ORD-T-1-3', 'o-hotel', 'o-sup-b', 'direct', 'paid', '{}', '{}', 0, 0, 0, 800, 0)$$);
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
  rows_affected($q$INSERT INTO orders (number, buyer_org_id, placed_by_user_id, idempotency_key, request_hash, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents)
              VALUES ('ORD-C-1', 'o-cafe', 'u-cafe', 'idem-1', 'h9', '{}', '{}', 0, 0, 0)$q$), 1::bigint);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-a-owner', 'o-sup-a', 'supplier', 'owner');
SELECT expect_eq('supplier A sees only its own sub-order', (SELECT string_agg(number, ',') FROM sub_orders), 'ORD-2026-000001-1');
SELECT expect_eq('supplier A sees only its own lines', (SELECT string_agg(sku, ',') FROM order_lines), 'RF-150');
SELECT expect_eq('supplier never reads the buyer''s orders row (other suppliers'' totals)', (SELECT count(*) FROM orders), 0::bigint);
SELECT expect_eq('supplier cannot download the pro-forma (lists other suppliers)', (SELECT count(*) FROM proforma_invoices), 0::bigint);
SELECT expect_eq('supplier A (platform mode) owner reads own ledger: 118338 − 7824', (SELECT sum(amount_cents) FROM ledger_entries), 110514::numeric);
-- Column grants (0004): a supplier moves the status, never the money or the snapshots.
SELECT expect_fail('supplier A cannot change its sub-order''s commission', $$UPDATE sub_orders SET commission_cents = 0 WHERE number = 'ORD-2026-000001-1'$$);
SELECT expect_fail('supplier A cannot change the mode of its sub-order', $$UPDATE sub_orders SET mode = 'direct' WHERE number = 'ORD-2026-000001-1'$$);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-a-member', 'o-sup-a', 'supplier', 'member');
SELECT expect_eq('supplier MEMBER cannot read the ledger (owner-only)', (SELECT count(*) FROM ledger_entries), 0::bigint);
SELECT expect_eq('supplier MEMBER cannot read IBAN', (SELECT count(*) FROM supplier_profiles), 0::bigint);
SELECT expect_eq('supplier member still sees its sub-orders', (SELECT count(*) FROM sub_orders), 1::bigint);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-b-owner', 'o-sup-b', 'supplier', 'owner');
SELECT expect_eq('supplier B ledger contains only B', (SELECT string_agg(DISTINCT supplier_org_id, ',') FROM ledger_entries), 'o-sup-b');
SELECT expect_eq('direct mode: supplier B owes its commission (balance −2958, negative on purpose)',
  (SELECT sum(amount_cents) FROM ledger_entries), -2958::numeric);
SELECT expect_eq('supplier B cannot ship supplier A''s sub-order (0 rows)',
  rows_affected($q$UPDATE sub_orders SET status = 'shipped' WHERE number = 'ORD-2026-000001-1'$q$), 0::bigint);
ROLLBACK;

-- ═════════════ 5. Cancellation and reversals (direct sub-order B) ═════════════
-- Buyer may cancel a pending sub-order but never move it forward.
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'member');
SELECT expect_fail('buyer cannot mark its sub-order shipped',
  $$UPDATE sub_orders SET status = 'shipped' WHERE id = '66666666-0000-0000-0000-00000000000b'$$);
UPDATE sub_orders SET status = 'cancelled', cancel_reason = 'ordered by mistake', cancelled_by_user_id = 'u-hotel'
 WHERE id = '66666666-0000-0000-0000-00000000000b';
INSERT INTO sub_order_events (sub_order_id, buyer_org_id, supplier_org_id, from_status, to_status, actor_user_id, actor_org_id)
VALUES ('66666666-0000-0000-0000-00000000000b', 'o-hotel', 'o-sup-b', 'pending', 'cancelled', 'u-hotel', 'o-hotel');
SELECT expect_fail('a DIRECT sub-order has no sale to reverse: sale_reversal is refused, even with the mirrored amount',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'sale_reversal', -55055, 'x', 'u-hotel')$$);
SELECT expect_fail('commission reversal with a wrong amount is rejected',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'commission_reversal', 1, 'x', 'u-hotel')$$);
INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id) VALUES
 ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'commission_reversal', 2958, 'cancelled by buyer', 'u-hotel');
SELECT app.recompute_order('55555555-0000-0000-0000-000000000001');
SELECT expect_eq('order stays in progress (A still pending) and unpaid (platform part 118338 unpaid)',
  (SELECT status::text || '/' || payment_status::text FROM orders), 'in_progress/unpaid');
COMMIT;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-b-owner', 'o-sup-b', 'supplier', 'owner');
SELECT expect_eq('supplier B balance is 0 after the reversal (−2958 + 2958)', (SELECT sum(amount_cents) FROM ledger_entries), 0::numeric);
SELECT expect_fail('a cancelled sub-order cannot be reversed twice (one reversal each)',
  $$INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description, created_by_user_id)
    VALUES ('o-sup-b', '66666666-0000-0000-0000-00000000000b', 'commission_reversal', 2958, 'again', 'u-b-owner')$$);
ROLLBACK;

-- ═════════════ 6. Platform mode: pay first, then ship ═════════════
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-a-member', 'o-sup-a', 'supplier', 'member');
UPDATE sub_orders SET status = 'confirmed' WHERE id = '66666666-0000-0000-0000-00000000000a';
SELECT expect_fail('a PLATFORM sub-order cannot be shipped before the order is paid (second layer, 012 M2)',
  $$UPDATE sub_orders SET status = 'shipped' WHERE id = '66666666-0000-0000-0000-00000000000a'$$);
COMMIT;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-admin', 'o-platform', 'platform', 'owner');
INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, bank_reference, recorded_by_user_id)
VALUES ('55555555-0000-0000-0000-000000000001', 'o-hotel', 'receipt', 118338, 'IZV-77', 'u-admin');
SELECT app.recompute_order('55555555-0000-0000-0000-000000000001');
SELECT expect_eq('paid the platform part (118338) → paid', (SELECT payment_status::text FROM orders), 'paid');
SELECT expect_eq('supplier copy of the payment status follows', (SELECT string_agg(DISTINCT order_payment_status::text, ',') FROM sub_orders), 'paid');
COMMIT;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-a-member', 'o-sup-a', 'supplier', 'member');
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

-- Direct mode and "nothing to pay": a rolled-back checkout of the Cafe.
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-cafe', 'o-cafe', 'buyer', 'owner');
INSERT INTO orders (id, number, buyer_org_id, placed_by_user_id, idempotency_key, request_hash, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents)
VALUES ('77777777-0000-0000-0000-000000000001', 'ORD-D-1', 'o-cafe', 'u-cafe', 'idem-d1', 'h', '{}', '{}', 15000, 3150, 18150),
       ('77777777-0000-0000-0000-000000000002', 'ORD-D-2', 'o-cafe', 'u-cafe', 'idem-d2', 'h', '{}', '{}', 5000, 1050, 6050);
INSERT INTO sub_orders (id, order_id, number, buyer_org_id, supplier_org_id, mode, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents, commission_bps, commission_cents) VALUES
 ('88888888-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', 'ORD-D-1-1', 'o-cafe', 'o-sup-a', 'platform', '{}', '{}', 10000, 2100, 12100, 800, 800),
 ('88888888-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000001', 'ORD-D-1-2', 'o-cafe', 'o-sup-b', 'direct',   '{}', '{}',  5000, 1050,  6050, 650, 325),
 ('88888888-0000-0000-0000-000000000003', '77777777-0000-0000-0000-000000000002', 'ORD-D-2-1', 'o-cafe', 'o-sup-b', 'direct',   '{}', '{}',  5000, 1050,  6050, 650, 325);
SELECT app.recompute_order('77777777-0000-0000-0000-000000000001');
SELECT expect_eq('mixed order: the amount due is the platform part, nothing paid → unpaid',
  (SELECT payment_status::text FROM orders WHERE id = '77777777-0000-0000-0000-000000000001'), 'unpaid');
SELECT app.recompute_order('77777777-0000-0000-0000-000000000002');
SELECT expect_eq('direct-only order → not_applicable (nothing is due to the platform)',
  (SELECT payment_status::text FROM orders WHERE id = '77777777-0000-0000-0000-000000000002'), 'not_applicable');
UPDATE sub_orders SET status = 'cancelled', cancel_reason = 'changed my mind', cancelled_by_user_id = 'u-cafe'
 WHERE id = '88888888-0000-0000-0000-000000000001';
SELECT app.recompute_order('77777777-0000-0000-0000-000000000001');
SELECT expect_eq('every platform part cancelled → not_applicable, not unpaid (012 rule)',
  (SELECT payment_status::text FROM orders WHERE id = '77777777-0000-0000-0000-000000000001'), 'not_applicable');
-- ... but if the card payment had already arrived, the buyer is owed it back: refund_due wins over not_applicable.
SELECT actor('u-admin', 'o-platform', 'platform', 'owner');
INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, bank_reference, recorded_by_user_id)
VALUES ('77777777-0000-0000-0000-000000000001', 'o-cafe', 'receipt', 12100, 'IZV-90', 'u-admin');
SELECT app.recompute_order('77777777-0000-0000-0000-000000000001');
SELECT expect_eq('paid, then every platform part cancelled → refund_due (not not_applicable)',
  (SELECT payment_status::text FROM orders WHERE id = '77777777-0000-0000-0000-000000000001'), 'refund_due');
-- The supplier of the direct sub-order ships without any payment on the platform.
SELECT actor('u-b-owner', 'o-sup-b', 'supplier', 'owner');
SELECT expect_eq('a DIRECT sub-order may be shipped while the order is not_applicable',
  rows_affected($q$UPDATE sub_orders SET status = 'shipped' WHERE id = '88888888-0000-0000-0000-000000000002'$q$), 1::bigint);
ROLLBACK;

-- ═════════════ 7. Platform: payments, payouts, commission payments, moderation, suspension ═════════════
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-admin', 'o-platform', 'platform', 'owner');
SELECT expect_eq('order completed (A delivered, B cancelled)', (SELECT status::text FROM orders WHERE id = '55555555-0000-0000-0000-000000000001'), 'completed');
SELECT expect_eq('platform sees every order', (SELECT count(*) FROM orders), 1::bigint);
INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, bank_reference, recorded_by_user_id)
VALUES ('55555555-0000-0000-0000-000000000001', 'o-hotel', 'receipt', 100, 'IZV-78', 'u-admin');
SELECT app.recompute_order('55555555-0000-0000-0000-000000000001');
SELECT expect_eq('paid more than the amount due → refund_due', (SELECT payment_status::text FROM orders), 'refund_due');
INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, bank_reference, recorded_by_user_id)
VALUES ('55555555-0000-0000-0000-000000000001', 'o-hotel', 'refund', 100, 'NAL-1', 'u-admin');
SELECT app.recompute_order('55555555-0000-0000-0000-000000000001');
SELECT expect_eq('after the refund → paid', (SELECT payment_status::text FROM orders), 'paid');
SELECT expect_fail('recorded payments are immutable', $$UPDATE order_payments SET amount_cents = 1$$);
INSERT INTO ledger_entries (supplier_org_id, type, amount_cents, description, reference, created_by_user_id)
VALUES ('o-sup-a', 'payout', -110514, 'payout', 'NAL-2', 'u-admin');
SELECT expect_eq('supplier A balance after payout = 0', (SELECT sum(amount_cents) FROM ledger_entries WHERE supplier_org_id = 'o-sup-a'), 0::numeric);
INSERT INTO ledger_entries (supplier_org_id, type, amount_cents, description, reference, created_by_user_id)
VALUES ('o-sup-b', 'commission_payment', 2958, 'commission paid by supplier B', 'IZV-80', 'u-admin');
SELECT expect_eq('the platform records a commission payment (+2958)',
  (SELECT sum(amount_cents) FROM ledger_entries WHERE supplier_org_id = 'o-sup-b' AND type = 'commission_payment'), 2958::numeric);
SELECT expect_fail('a commission payment must be positive',
  $$INSERT INTO ledger_entries (supplier_org_id, type, amount_cents, description, created_by_user_id) VALUES ('o-sup-b', 'commission_payment', -5, 'x', 'u-admin')$$);
SELECT expect_fail('ledger is append-only: UPDATE', $$UPDATE ledger_entries SET amount_cents = 1$$);
SELECT expect_fail('ledger is append-only: DELETE', $$DELETE FROM ledger_entries$$);
SELECT expect_fail('platform cannot book a sale (only payout / adjustment / commission payment)',
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

-- ═════════════ 8. Worker (system context) ═════════════
BEGIN; SET LOCAL ROLE horeca_worker;
SELECT expect_eq('worker reads every product (search sync)', (SELECT count(*) FROM products), 4::bigint);
SELECT expect_eq('worker stores the rendered PDF key',
  rows_affected($q$UPDATE proforma_invoices SET storage_key = 'invoices/pf-1.pdf', pdf_generated_at = now()$q$), 1::bigint);
SELECT expect_eq('worker records the supplier submission result (supplier_submission only)',
  rows_affected($q$UPDATE sub_orders SET supplier_submission = 'accepted' WHERE id = '66666666-0000-0000-0000-00000000000a'$q$), 1::bigint);
SELECT expect_fail('worker cannot change a sub-order''s status (column grant)', $$UPDATE sub_orders SET status = 'cancelled'$$);
SELECT expect_fail('worker cannot change a sub-order''s money (column grant)', $$UPDATE sub_orders SET gross_cents = 1$$);
SELECT expect_fail('worker cannot change prices', $$UPDATE products SET base_price_cents = 1$$);
SELECT expect_fail('worker cannot write the ledger', $$INSERT INTO ledger_entries (supplier_org_id, type, amount_cents, description) VALUES ('o-sup-a', 'adjustment', 1, 'x')$$);
SELECT expect_fail('worker cannot change invoice amounts', $$UPDATE proforma_invoices SET gross_cents = 1$$);
SELECT expect_fail('worker cannot insert a pro-forma version (no re-issue)',
  $$INSERT INTO proforma_invoices (order_id, buyer_org_id, version, number, issuer_snapshot, buyer_snapshot, content_snapshot, vat_breakdown, net_cents, vat_cents, gross_cents, due_date, payment_reference)
    VALUES ('55555555-0000-0000-0000-000000000001', 'o-hotel', 2, 'PF-X/2', '{}', '{}', '{}', '[]', 0, 0, 0, current_date, 'x')$$);
ROLLBACK;

-- ═════════════ 9. D5-B0: contracts, card payments, stock cache, system cancellation (migration 0006) ═════════════
-- Fixtures (superuser). Supplier A was suspended in section 7: approve it again so that requests and visibility work.
UPDATE org_profiles SET status = 'approved' WHERE organization_id = 'o-sup-a';
-- Cafe's order: a platform sub-order with A (gross 12100, commission 800) and a direct one with B (gross 6050, commission 325).
INSERT INTO orders (id, number, buyer_org_id, placed_by_user_id, idempotency_key, request_hash, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents)
VALUES ('99999999-0000-0000-0000-000000000001', 'ORD-B0-1', 'o-cafe', 'u-cafe', 'idem-b0-1', 'h', '{}', '{}', 15000, 3150, 18150);
INSERT INTO sub_orders (id, order_id, number, buyer_org_id, supplier_org_id, mode, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents, commission_bps, commission_cents) VALUES
 ('99999999-0000-0000-0000-0000000000a1', '99999999-0000-0000-0000-000000000001', 'ORD-B0-1-1', 'o-cafe', 'o-sup-a', 'platform', '{}', '{}', 10000, 2100, 12100, 800, 800),
 ('99999999-0000-0000-0000-0000000000b1', '99999999-0000-0000-0000-000000000001', 'ORD-B0-1-2', 'o-cafe', 'o-sup-b', 'direct',   '{}', '{}',  5000, 1050,  6050, 650, 325);
INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description) VALUES
 ('o-sup-a', '99999999-0000-0000-0000-0000000000a1', 'sale', 12100, 'sale'),
 ('o-sup-a', '99999999-0000-0000-0000-0000000000a1', 'commission', -800, 'commission'),
 ('o-sup-b', '99999999-0000-0000-0000-0000000000b1', 'commission', -325, 'commission');

-- ───── 9.1 Contracts (supplier_agreements) ─────
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'member');
INSERT INTO supplier_agreements (id, buyer_org_id, supplier_org_id, requested_by_user_id, buyer_note)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'o-hotel', 'o-sup-a', 'u-hotel', 'please');
SELECT expect_eq('a buyer MEMBER requests a contract; it starts as requested',
  (SELECT status::text FROM supplier_agreements WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'requested');
SELECT expect_fail('only one open request or contract per buyer and supplier',
  $$INSERT INTO supplier_agreements (buyer_org_id, supplier_org_id, requested_by_user_id) VALUES ('o-hotel', 'o-sup-a', 'u-hotel')$$);
SELECT expect_fail('a buyer cannot create an already active contract',
  $$INSERT INTO supplier_agreements (buyer_org_id, supplier_org_id, status, requested_by_user_id, decided_by_user_id, decided_at)
    VALUES ('o-hotel', 'o-sup-p', 'active', 'u-hotel', 'u-a-owner', now())$$);
SELECT expect_fail('a buyer cannot request a contract in another buyer''s name',
  $$INSERT INTO supplier_agreements (buyer_org_id, supplier_org_id, requested_by_user_id) VALUES ('o-cafe', 'o-sup-a', 'u-hotel')$$);
SELECT expect_fail('a buyer cannot rewrite its note afterwards (column grant)',
  $$UPDATE supplier_agreements SET buyer_note = 'changed'$$);
SELECT expect_eq('a buyer MEMBER cannot decide or end (UPDATE touches 0 rows)',
  rows_affected($q$UPDATE supplier_agreements SET status = 'active', decided_by_user_id = 'u-hotel', decided_at = now() WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$), 0::bigint);
SELECT actor('u-hotel', 'o-hotel', 'buyer', 'owner');
SELECT expect_fail('a buyer owner cannot accept its own request (guard)',
  $$UPDATE supplier_agreements SET status = 'active', decided_by_user_id = 'u-hotel', decided_at = now()$$);
SELECT actor('u-cafe', 'o-cafe', 'buyer', 'owner');
SELECT expect_eq('another buyer does not see the request', (SELECT count(*) FROM supplier_agreements WHERE supplier_org_id = 'o-sup-a'), 0::bigint);
SELECT actor('u-b-owner', 'o-sup-b', 'supplier', 'owner');
SELECT expect_eq('another supplier does not see the request', (SELECT count(*) FROM supplier_agreements WHERE supplier_org_id = 'o-sup-a'), 0::bigint);
SELECT actor('u-admin', 'o-platform', 'platform', 'owner');
SELECT expect_eq('the platform reads every contract', (SELECT count(*) FROM supplier_agreements), 3::bigint);
SELECT expect_eq('the platform cannot change a contract (0 rows)',
  rows_affected($q$UPDATE supplier_agreements SET status = 'active', decided_by_user_id = 'u-admin', decided_at = now()$q$), 0::bigint);
SELECT actor('u-a-member', 'o-sup-a', 'supplier', 'member');
SELECT expect_eq('the supplier sees the request', (SELECT count(*) FROM supplier_agreements), 1::bigint);
SELECT expect_fail('the decider must be the acting user',
  $$UPDATE supplier_agreements SET status = 'active', decided_by_user_id = 'u-a-owner', decided_at = now()$$);
SELECT expect_eq('a supplier MEMBER accepts the request',
  rows_affected($q$UPDATE supplier_agreements SET status = 'active', decided_by_user_id = 'u-a-member', decided_at = now(), payment_term_days = 30, supplier_note = 'welcome'$q$), 1::bigint);
SELECT expect_fail('an active contract cannot go back to requested', $$UPDATE supplier_agreements SET status = 'requested'$$);
SELECT expect_fail('a supplier MEMBER cannot end a contract (owner only)',
  $$UPDATE supplier_agreements SET status = 'ended', ended_at = now()$$);
SELECT actor('u-a-owner', 'o-sup-a', 'supplier', 'owner');
SELECT expect_eq('the supplier OWNER ends the contract',
  rows_affected($q$UPDATE supplier_agreements SET status = 'ended', ended_at = now()$q$), 1::bigint);
SELECT expect_fail('an ended contract cannot be revived', $$UPDATE supplier_agreements SET status = 'active', ended_at = NULL$$);
SELECT actor('u-hotel', 'o-hotel', 'buyer', 'member');
INSERT INTO supplier_agreements (buyer_org_id, supplier_org_id, requested_by_user_id) VALUES ('o-hotel', 'o-sup-a', 'u-hotel');
SELECT expect_eq('after the contract ended the buyer may request a new one',
  (SELECT count(*) FROM supplier_agreements WHERE supplier_org_id = 'o-sup-a' AND status = 'requested'), 1::bigint);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-cafe', 'o-cafe', 'buyer', 'member');
SELECT expect_fail('no contract request with a supplier the buyer cannot see (pending supplier)',
  $$INSERT INTO supplier_agreements (buyer_org_id, supplier_org_id, requested_by_user_id) VALUES ('o-cafe', 'o-sup-p', 'u-cafe')$$);
SELECT expect_fail('no contract request with a buyer',
  $$INSERT INTO supplier_agreements (buyer_org_id, supplier_org_id, requested_by_user_id) VALUES ('o-cafe', 'o-hotel', 'u-cafe')$$);
SELECT expect_fail('the requesting user must be the acting user',
  $$INSERT INTO supplier_agreements (buyer_org_id, supplier_org_id, requested_by_user_id) VALUES ('o-cafe', 'o-sup-a', 'u-hotel')$$);
INSERT INTO supplier_agreements (id, buyer_org_id, supplier_org_id, requested_by_user_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000002', 'o-cafe', 'o-sup-a', 'u-cafe');
SELECT actor('u-a-owner', 'o-sup-a', 'supplier', 'owner');
SELECT expect_eq('the supplier rejects the request',
  rows_affected($q$UPDATE supplier_agreements SET status = 'rejected', decided_by_user_id = 'u-a-owner', decided_at = now(), supplier_note = 'not now'$q$), 1::bigint);
SELECT expect_fail('a rejected request cannot be accepted later', $$UPDATE supplier_agreements SET status = 'active', decided_by_user_id = 'u-a-owner'$$);
ROLLBACK;

-- Second layer for direct mode: a `direct` sub-order needs an active contract between exactly this pair.
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-cafe', 'o-cafe', 'buyer', 'owner');
INSERT INTO supplier_agreements (buyer_org_id, supplier_org_id, requested_by_user_id) VALUES ('o-cafe', 'o-sup-a', 'u-cafe');
INSERT INTO orders (id, number, buyer_org_id, placed_by_user_id, idempotency_key, request_hash, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents)
VALUES ('99999999-0000-0000-0000-000000000002', 'ORD-B0-2', 'o-cafe', 'u-cafe', 'idem-b0-2', 'h', '{}', '{}', 2000, 420, 2420);
SELECT expect_fail('a direct sub-order needs an ACTIVE contract (a request is not enough)',
  $$INSERT INTO sub_orders (order_id, number, buyer_org_id, supplier_org_id, mode, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents, commission_bps, commission_cents)
    VALUES ('99999999-0000-0000-0000-000000000002', 'ORD-B0-2-1', 'o-cafe', 'o-sup-a', 'direct', '{}', '{}', 1000, 210, 1210, 800, 80)$$);
INSERT INTO sub_orders (order_id, number, buyer_org_id, supplier_org_id, mode, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents, commission_bps, commission_cents)
VALUES ('99999999-0000-0000-0000-000000000002', 'ORD-B0-2-2', 'o-cafe', 'o-sup-b', 'platform', '{}', '{}', 1000, 210, 1210, 650, 65);
SELECT expect_eq('a platform sub-order needs no contract', (SELECT count(*) FROM sub_orders WHERE order_id = '99999999-0000-0000-0000-000000000002'), 1::bigint);
SELECT actor('u-a-owner', 'o-sup-a', 'supplier', 'owner');
UPDATE supplier_agreements SET status = 'active', decided_by_user_id = 'u-a-owner', decided_at = now() WHERE buyer_org_id = 'o-cafe' AND supplier_org_id = 'o-sup-a';
SELECT actor('u-cafe', 'o-cafe', 'buyer', 'owner');
INSERT INTO sub_orders (order_id, number, buyer_org_id, supplier_org_id, mode, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents, commission_bps, commission_cents)
VALUES ('99999999-0000-0000-0000-000000000002', 'ORD-B0-2-1', 'o-cafe', 'o-sup-a', 'direct', '{}', '{}', 1000, 210, 1210, 800, 80);
SELECT expect_eq('once the supplier accepted, the same direct sub-order is allowed', (SELECT count(*) FROM sub_orders WHERE order_id = '99999999-0000-0000-0000-000000000002'), 2::bigint);
SELECT expect_fail('no contract with this supplier → still no direct sub-order',
  $$INSERT INTO sub_orders (order_id, number, buyer_org_id, supplier_org_id, mode, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents, commission_bps, commission_cents)
    VALUES ('99999999-0000-0000-0000-000000000002', 'ORD-B0-2-3', 'o-cafe', 'o-sup-p', 'direct', '{}', '{}', 1000, 210, 1210, 800, 80)$$);
ROLLBACK;

-- ───── 9.2 Card payments ─────
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-cafe', 'o-cafe', 'buyer', 'member');
INSERT INTO payments (id, order_id, buyer_org_id, idempotency_key, amount_cents)
VALUES ('99999999-0000-0000-0000-0000000000c1', '99999999-0000-0000-0000-000000000001', 'o-cafe', 'b0-pay-1', 12100);
SELECT expect_fail('a buyer cannot insert an already succeeded payment',
  $$INSERT INTO payments (order_id, buyer_org_id, idempotency_key, amount_cents, status) VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'b0-x1', 12100, 'succeeded')$$);
SELECT expect_fail('a buyer cannot insert a payment with a refund booked',
  $$INSERT INTO payments (order_id, buyer_org_id, idempotency_key, amount_cents, refunded_cents) VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'b0-x2', 12100, 5)$$);
SELECT expect_fail('a buyer cannot pay for another buyer''s order',
  $$INSERT INTO payments (order_id, buyer_org_id, idempotency_key, amount_cents) VALUES ('55555555-0000-0000-0000-000000000001', 'o-cafe', 'b0-x3', 100)$$);
SELECT expect_fail('a buyer cannot create a payment in another buyer''s name',
  $$INSERT INTO payments (order_id, buyer_org_id, idempotency_key, amount_cents) VALUES ('99999999-0000-0000-0000-000000000001', 'o-hotel', 'b0-x4', 12100)$$);
SELECT expect_fail('a payment must be positive',
  $$INSERT INTO payments (order_id, buyer_org_id, idempotency_key, amount_cents) VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'b0-x5', 0)$$);
SELECT expect_fail('the idempotency key is unique',
  $$INSERT INTO payments (order_id, buyer_org_id, idempotency_key, amount_cents) VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'b0-pay-1', 12100)$$);
INSERT INTO payments (id, order_id, buyer_org_id, idempotency_key, amount_cents)
VALUES ('99999999-0000-0000-0000-0000000000c2', '99999999-0000-0000-0000-000000000001', 'o-cafe', 'b0-pay-2', 12100);
SELECT expect_fail('the buyer cannot mark a payment succeeded itself (only created → pending)',
  $$UPDATE payments SET status = 'succeeded' WHERE id = '99999999-0000-0000-0000-0000000000c2'$$);
SELECT expect_fail('the buyer cannot change the amount (column grant)', $$UPDATE payments SET amount_cents = 1$$);
SELECT expect_fail('the buyer cannot book a refund (column grant)', $$UPDATE payments SET refunded_cents = 1$$);
SELECT expect_fail('marking pending needs the provider reference',
  $$UPDATE payments SET status = 'pending' WHERE id = '99999999-0000-0000-0000-0000000000c2'$$);
SELECT expect_eq('after the gateway answered the buyer marks its attempt pending',
  rows_affected($q$UPDATE payments SET status = 'pending', provider_ref = 'mock-1', updated_at = now() WHERE id = '99999999-0000-0000-0000-0000000000c1'$q$), 1::bigint);
SELECT expect_eq('a pending payment is no longer the buyer''s to change (0 rows)',
  rows_affected($q$UPDATE payments SET status = 'pending', provider_ref = 'mock-9' WHERE id = '99999999-0000-0000-0000-0000000000c1'$q$), 0::bigint);
SELECT expect_eq('the buyer sees its payments', (SELECT count(*) FROM payments), 2::bigint);
SELECT expect_fail('the web login has no access to payment events', $$SELECT count(*) FROM payment_events$$);
COMMIT;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'owner');
SELECT expect_eq('another buyer sees no payment', (SELECT count(*) FROM payments), 0::bigint);
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-a-owner', 'o-sup-a', 'supplier', 'owner');
SELECT expect_eq('a supplier sees no payment', (SELECT count(*) FROM payments), 0::bigint);
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-admin', 'o-platform', 'platform', 'owner');
SELECT expect_eq('the platform reads every payment', (SELECT count(*) FROM payments), 2::bigint);
SELECT expect_eq('the platform cannot change a payment (0 rows)', rows_affected($q$UPDATE payments SET status = 'failed'$q$), 0::bigint);
ROLLBACK;

-- The worker processes the gateway events (system context).
BEGIN; SET LOCAL ROLE horeca_worker;
SELECT expect_eq('worker: payment succeeded',
  rows_affected($q$UPDATE payments SET status = 'succeeded', updated_at = now() WHERE id = '99999999-0000-0000-0000-0000000000c1'$q$), 1::bigint);
SELECT expect_fail('at most one succeeded payment per order',
  $$UPDATE payments SET status = 'succeeded' WHERE id = '99999999-0000-0000-0000-0000000000c2'$$);
INSERT INTO payment_events (payment_id, provider_event_id, type, signature_valid, amount_cents, raw)
VALUES ('99999999-0000-0000-0000-0000000000c1', 'evt-b0-1', 'payment.succeeded', true, 12100, '{}');
SELECT expect_fail('a duplicate callback (same provider_event_id) is rejected',
  $$INSERT INTO payment_events (payment_id, provider_event_id, type, signature_valid, raw) VALUES ('99999999-0000-0000-0000-0000000000c1', 'evt-b0-1', 'payment.succeeded', true, '{}')$$);
SELECT expect_fail('payment events are insert-only: UPDATE', $$UPDATE payment_events SET type = 'x'$$);
SELECT expect_fail('payment events are insert-only: DELETE', $$DELETE FROM payment_events$$);
SELECT expect_fail('worker: a receipt must carry exactly the payment''s amount',
  $$INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, payment_id) VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'receipt', 12000, '99999999-0000-0000-0000-0000000000c1')$$);
SELECT expect_fail('worker: the receipt must belong to the payment''s order',
  $$INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, payment_id) VALUES ('55555555-0000-0000-0000-000000000001', 'o-hotel', 'receipt', 12100, '99999999-0000-0000-0000-0000000000c1')$$);
SELECT expect_fail('worker: no receipt for a payment that is not succeeded',
  $$INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, payment_id) VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'receipt', 12100, '99999999-0000-0000-0000-0000000000c2')$$);
SELECT expect_fail('worker: a receipt cannot name a recording user',
  $$INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, payment_id, recorded_by_user_id) VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'receipt', 12100, '99999999-0000-0000-0000-0000000000c1', 'u-admin')$$);
INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, payment_id)
VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'receipt', 12100, '99999999-0000-0000-0000-0000000000c1');
SELECT expect_fail('one receipt per payment',
  $$INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, payment_id) VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'receipt', 12100, '99999999-0000-0000-0000-0000000000c1')$$);
SELECT app.recompute_order('99999999-0000-0000-0000-000000000001');
SELECT expect_eq('the receipt pays the platform part (the direct part is not due to the platform)',
  (SELECT payment_status::text FROM orders WHERE id = '99999999-0000-0000-0000-000000000001'), 'paid');
INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, payment_id)
VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'refund', 12100, '99999999-0000-0000-0000-0000000000c1');
SELECT expect_eq('the SAME payment can have a refund next to its receipt (UNIQUE on payment_id was dropped)',
  (SELECT count(*) FROM order_payments WHERE payment_id = '99999999-0000-0000-0000-0000000000c1'), 2::bigint);
SELECT expect_fail('worker: a refund cannot exceed the payment',
  $$INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, payment_id) VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'refund', 12101, '99999999-0000-0000-0000-0000000000c1')$$);
SELECT expect_fail('worker: a refund without a payment is denied',
  $$INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents) VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'refund', 100)$$);
SELECT expect_eq('worker: refunded_cents follows the refund',
  rows_affected($q$UPDATE payments SET refunded_cents = 12100 WHERE id = '99999999-0000-0000-0000-0000000000c1'$q$), 1::bigint);
SELECT expect_fail('refunded_cents cannot exceed the amount', $$UPDATE payments SET refunded_cents = 12101 WHERE id = '99999999-0000-0000-0000-0000000000c1'$$);
SELECT expect_fail('refunded_cents only on a succeeded payment', $$UPDATE payments SET refunded_cents = 5 WHERE id = '99999999-0000-0000-0000-0000000000c2'$$);
SELECT app.recompute_order('99999999-0000-0000-0000-000000000001');
SELECT expect_eq('receipt − refund = 0 → unpaid again', (SELECT payment_status::text FROM orders WHERE id = '99999999-0000-0000-0000-000000000001'), 'unpaid');
-- Aimed at the still-`created` attempt (nothing refunded), so a successful change would be a valid row: only the column grant stops it.
SELECT expect_fail('worker cannot change the amount of a payment (column grant)',
  $$UPDATE payments SET amount_cents = 1 WHERE id = '99999999-0000-0000-0000-0000000000c2'$$);
SELECT expect_fail('worker cannot create payments', $$INSERT INTO payments (order_id, buyer_org_id, idempotency_key, amount_cents) VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'b0-w', 1)$$);
ROLLBACK;

-- ───── 9.3 Stock cache (product_stock) ─────
INSERT INTO product_stock (product_id, available_qty, status, fetched_at) VALUES
 ('33333333-0000-0000-0000-00000000000a', 12, 'ok', now()),
 ('33333333-0000-0000-0000-0000000000ad', 3, 'ok', now()),
 ('33333333-0000-0000-0000-00000000000b', NULL, 'unknown', now()),
 ('33333333-0000-0000-0000-00000000000f', 7, 'ok', now());
SELECT expect_fail('stock: "unknown" has no quantity',
  $$INSERT INTO product_stock (product_id, available_qty, status, fetched_at) SELECT id, 1, 'unknown', now() FROM products WHERE sku = 'RF-150' ON CONFLICT (product_id) DO UPDATE SET available_qty = 1, status = 'unknown'$$);
SELECT expect_fail('stock: "ok" needs a quantity', $$UPDATE product_stock SET available_qty = NULL WHERE status = 'ok'$$);
SELECT expect_fail('stock: the quantity cannot be negative', $$UPDATE product_stock SET available_qty = -1 WHERE status = 'ok'$$);
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'owner');
SELECT expect_eq('a buyer sees the stock of visible products only (A active, B active — not the draft, not the pending supplier)',
  (SELECT count(*) FROM product_stock), 2::bigint);
SELECT expect_fail('the web login cannot write stock', $$UPDATE product_stock SET available_qty = 999$$);
SELECT expect_fail('the web login cannot insert stock', $$INSERT INTO product_stock (product_id, available_qty, status, fetched_at) VALUES ('33333333-0000-0000-0000-00000000000a', 1, 'ok', now())$$);
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-a-owner', 'o-sup-a', 'supplier', 'owner');
SELECT expect_eq('a supplier sees its own draft''s stock too (own A: 2 + B active: 1)', (SELECT count(*) FROM product_stock), 3::bigint);
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_worker;
SELECT expect_eq('worker reads all stock', (SELECT count(*) FROM product_stock), 4::bigint);
INSERT INTO product_stock (product_id, available_qty, status, fetched_at) VALUES ('33333333-0000-0000-0000-00000000000b', 5, 'ok', now())
  ON CONFLICT (product_id) DO UPDATE SET available_qty = EXCLUDED.available_qty, status = EXCLUDED.status, fetched_at = EXCLUDED.fetched_at;
SELECT expect_eq('worker upserts the stock', (SELECT available_qty FROM product_stock WHERE product_id = '33333333-0000-0000-0000-00000000000b'), 5);
SELECT expect_fail('worker cannot delete stock rows', $$DELETE FROM product_stock$$);
ROLLBACK;

-- ───── 9.4 app.system_cancel_sub_order ─────
-- The function also checks its caller, but the EXECUTE grant is the first lock: test it on its own.
SELECT expect_eq('EXECUTE on system_cancel_sub_order: the worker yes; the web login and PUBLIC no',
  has_function_privilege('horeca_worker', 'app.system_cancel_sub_order(uuid, text)', 'EXECUTE')
  AND NOT has_function_privilege('horeca_app', 'app.system_cancel_sub_order(uuid, text)', 'EXECUTE')
  AND NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                  WHERE p.proname = 'system_cancel_sub_order' AND a.grantee = 0), true);
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-cafe', 'o-cafe', 'buyer', 'owner');
SELECT expect_fail('the web login (buyer) cannot call the system cancellation',
  $$SELECT app.system_cancel_sub_order('99999999-0000-0000-0000-0000000000a1', 'payment expired')$$);
SELECT actor('u-admin', 'o-platform', 'platform', 'owner');
SELECT expect_fail('the web login (platform) cannot call it either',
  $$SELECT app.system_cancel_sub_order('99999999-0000-0000-0000-0000000000a1', 'payment expired')$$);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_worker;
SELECT expect_eq('platform sub-order before: owed gross − commission', (SELECT sum(amount_cents) FROM ledger_entries WHERE sub_order_id = '99999999-0000-0000-0000-0000000000a1'), 11300::numeric);
SELECT app.system_cancel_sub_order('99999999-0000-0000-0000-0000000000a1', 'payment expired');
SELECT expect_eq('platform: cancelled with the reason and no user',
  (SELECT status::text || '|' || cancel_reason || '|' || coalesce(cancelled_by_user_id, 'system') FROM sub_orders WHERE id = '99999999-0000-0000-0000-0000000000a1'), 'cancelled|payment expired|system');
SELECT expect_eq('platform: reversals book sale_reversal and commission_reversal, entries sum to 0',
  (SELECT string_agg(type::text, ',' ORDER BY type::text) || '|' || sum(amount_cents) FROM ledger_entries WHERE sub_order_id = '99999999-0000-0000-0000-0000000000a1'),
  'commission,commission_reversal,sale,sale_reversal|0');
SELECT expect_eq('the history has the system''s event',
  (SELECT count(*) FROM sub_order_events WHERE sub_order_id = '99999999-0000-0000-0000-0000000000a1' AND to_status = 'cancelled' AND actor_user_id IS NULL AND note = 'payment expired'), 1::bigint);
SELECT expect_eq('the order is recomputed: nothing left to pay → not_applicable, still in progress (the direct part is open)',
  (SELECT payment_status::text || '|' || status::text FROM orders WHERE id = '99999999-0000-0000-0000-000000000001'), 'not_applicable|in_progress');
SELECT app.system_cancel_sub_order('99999999-0000-0000-0000-0000000000a1', 'payment expired');
SELECT expect_eq('running it twice changes nothing (idempotent job): still 4 ledger rows, 1 event',
  (SELECT (SELECT count(*) FROM ledger_entries WHERE sub_order_id = '99999999-0000-0000-0000-0000000000a1') * 10
        + (SELECT count(*) FROM sub_order_events WHERE sub_order_id = '99999999-0000-0000-0000-0000000000a1')), 41::bigint);
SELECT app.system_cancel_sub_order('99999999-0000-0000-0000-0000000000b1', 'supplier API rejected');
SELECT expect_eq('direct: only commission_reversal, no sale_reversal; entries sum to 0',
  (SELECT string_agg(type::text, ',' ORDER BY type::text) || '|' || sum(amount_cents) FROM ledger_entries WHERE sub_order_id = '99999999-0000-0000-0000-0000000000b1'),
  'commission,commission_reversal|0');
SELECT expect_eq('all sub-orders cancelled → the order is cancelled',
  (SELECT status::text FROM orders WHERE id = '99999999-0000-0000-0000-000000000001'), 'cancelled');
SELECT expect_fail('a cancel reason is required', $$SELECT app.system_cancel_sub_order('99999999-0000-0000-0000-0000000000a1', '  ')$$);
SELECT expect_fail('an unknown sub-order is refused', $$SELECT app.system_cancel_sub_order('99999999-0000-0000-0000-0000000000ff', 'x')$$);
ROLLBACK;

-- A paid platform sub-order cancelled by the system leaves a refund due (the job then asks the gateway for the refund).
BEGIN;
UPDATE payments SET status = 'succeeded' WHERE id = '99999999-0000-0000-0000-0000000000c1';
INSERT INTO order_payments (order_id, buyer_org_id, type, amount_cents, payment_id)
VALUES ('99999999-0000-0000-0000-000000000001', 'o-cafe', 'receipt', 12100, '99999999-0000-0000-0000-0000000000c1');
SET LOCAL ROLE horeca_worker;
SELECT app.recompute_order('99999999-0000-0000-0000-000000000001');
SELECT expect_eq('paid before the cancellation', (SELECT payment_status::text FROM orders WHERE id = '99999999-0000-0000-0000-000000000001'), 'paid');
SELECT app.system_cancel_sub_order('99999999-0000-0000-0000-0000000000a1', 'supplier API rejected');
SELECT expect_eq('cancelled after payment → refund_due', (SELECT payment_status::text FROM orders WHERE id = '99999999-0000-0000-0000-000000000001'), 'refund_due');
ROLLBACK;

-- Shipped sub-orders can no longer be cancelled, not even by the system.
BEGIN;
UPDATE sub_orders SET status = 'shipped' WHERE id = '99999999-0000-0000-0000-0000000000b1';
SET LOCAL ROLE horeca_worker;
SELECT expect_fail('a shipped sub-order is refused',
  $$SELECT app.system_cancel_sub_order('99999999-0000-0000-0000-0000000000b1', 'supplier API rejected')$$);
ROLLBACK;

-- ═════════════ 10. Issue #63: a member reads the profiles of ALL their organizations (migration 0007) ═════════════
-- Fixtures (superuser). `u-multi` belongs to the hotel, to the cafe (two buyers) and to the pending supplier P;
-- `u-hotel` and `u-cafe` belong to their own buyer only. Before 0007 a buyer could never read another buyer's
-- profile, nor a pending supplier's: only its own, the platform's view and approved suppliers.
INSERT INTO "user" (id, email, name) VALUES ('u-multi', 'multi-rls@demo.local', 'Multi');
INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
 ('m-multi-hotel', 'o-hotel', 'u-multi', 'owner', now()),
 ('m-multi-cafe', 'o-cafe', 'u-multi', 'owner', now()),
 ('m-multi-p', 'o-sup-p', 'u-multi', 'member', now()),
 ('m-hotel', 'o-hotel', 'u-hotel', 'owner', now()),
 ('m-cafe', 'o-cafe', 'u-cafe', 'owner', now());

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-multi', 'o-hotel', 'buyer', 'owner');
SELECT expect_eq('a member reads the profile of EVERY organization they belong to (acting as the hotel: + cafe + pending supplier P)',
  (SELECT string_agg(organization_id, ',' ORDER BY organization_id) FROM org_profiles), 'o-cafe,o-hotel,o-sup-a,o-sup-b,o-sup-p');
SELECT expect_eq('the type and legal name of the NOT active organization are readable',
  (SELECT type::text || '|' || legal_name FROM org_profiles WHERE organization_id = 'o-cafe'), 'buyer|Cafe Luna d.o.o.');
SELECT expect_eq('another organization of the user is still not the one they act for: its profile cannot be changed (0 rows)',
  rows_affected($q$UPDATE org_profiles SET legal_name = 'hacked' WHERE organization_id = 'o-cafe'$q$), 0::bigint);
SELECT expect_fail('… and the guard / policy for a profile INSERT is untouched: no new profile in another organization''s name',
  $$INSERT INTO org_profiles (organization_id, type, status, legal_name, tax_id, address_line, city, postal_code, contact_email)
    VALUES ('o-new', 'buyer', 'approved', 'X', '09999999', 'x', 'x', '81000', 'x@demo.local')$$);
SELECT expect_eq('the new policy opens org_profiles ONLY: other organizations'' bank details and locations stay closed',
  (SELECT count(*) FROM supplier_profiles WHERE organization_id = 'o-sup-p') + (SELECT count(*) FROM buyer_locations WHERE organization_id = 'o-cafe'), 0::bigint);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'owner');
SELECT expect_eq('a buyer with ONE membership sees exactly what it saw before: itself and the approved suppliers',
  (SELECT string_agg(organization_id, ',' ORDER BY organization_id) FROM org_profiles), 'o-hotel,o-sup-a,o-sup-b');
SELECT expect_eq('a non-member does not see another buyer''s profile', (SELECT count(*) FROM org_profiles WHERE organization_id = 'o-cafe'), 0::bigint);
ROLLBACK;

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-cafe', 'o-cafe', 'buyer', 'owner');
SELECT expect_eq('a non-member does not see a PENDING supplier''s profile (only its members do)',
  (SELECT count(*) FROM org_profiles WHERE organization_id = 'o-sup-p'), 0::bigint);
ROLLBACK;

-- Removing the membership removes the visibility with it.
BEGIN;
DELETE FROM member WHERE id = 'm-multi-cafe';
SET LOCAL ROLE horeca_app; SELECT actor('u-multi', 'o-hotel', 'buyer', 'owner');
SELECT expect_eq('after the membership is removed the organization disappears again',
  (SELECT count(*) FROM org_profiles WHERE organization_id = 'o-cafe'), 0::bigint);
SELECT expect_eq('… while the others stay', (SELECT count(*) FROM org_profiles WHERE organization_id IN ('o-hotel', 'o-sup-p')), 2::bigint);
ROLLBACK;

-- No actor context: app.user_id() is NULL, so the membership policy matches nothing.
BEGIN; SET LOCAL ROLE horeca_app;
SELECT expect_eq('no actor: still nothing, with the new policy and members present', (SELECT count(*) FROM org_profiles), 0::bigint);
ROLLBACK;

-- The platform and the worker are unaffected (they have their own policies).
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-admin', 'o-platform', 'platform', 'owner');
SELECT expect_eq('the platform still reads every profile (7 fixtures)', (SELECT count(*) FROM org_profiles), 7::bigint);
ROLLBACK;

SELECT 'ALL RLS TESTS PASSED' AS result;
