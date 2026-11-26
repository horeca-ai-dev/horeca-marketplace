-- RLS integration tests for migration 0005 (run after ALL migrations, as the superuser).
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

SELECT 'ALL RLS TESTS PASSED' AS result;
