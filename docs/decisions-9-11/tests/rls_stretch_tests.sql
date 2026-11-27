-- Stretch RLS tests (S1, S5). Runs after rls_tests.sql in the same database. (The S6 card-payment checks moved into rls_tests.sql, section 9, with D5-B0.)
\set ON_ERROR_STOP 1
INSERT INTO buyer_prices (product_id, supplier_org_id, buyer_org_id, unit_price_cents, valid_from)
VALUES ('33333333-0000-0000-0000-00000000000b', 'o-sup-b', 'o-hotel', 44000, current_date);
INSERT INTO rfq_requests (id, buyer_org_id, created_by_user_id, delivery_location_id, title, quantity, unit, deadline)
VALUES ('77777777-0000-0000-0000-000000000001', 'o-hotel', 'u-hotel', '11111111-0000-0000-0000-000000000001', '20 ice makers', 20, 'piece', current_date + 14);
INSERT INTO rfq_invitations (rfq_id, supplier_org_id, buyer_org_id) VALUES ('77777777-0000-0000-0000-000000000001', 'o-sup-b', 'o-hotel');

BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-cafe', 'o-cafe', 'buyer', 'owner');
SELECT expect_eq('S1: buyer B never sees buyer A''s price', (SELECT count(*) FROM buyer_prices), 0::bigint);
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-hotel', 'o-hotel', 'buyer', 'owner');
SELECT expect_eq('S1: the named buyer sees its price', (SELECT count(*) FROM buyer_prices), 1::bigint);
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-b-owner', 'o-sup-b', 'supplier', 'owner');
SELECT expect_eq('S5: invited supplier sees the RFQ', (SELECT count(*) FROM rfq_requests), 1::bigint);
INSERT INTO rfq_quotes (rfq_id, supplier_org_id, buyer_org_id, unit_price_cents, vat_rate_bps, lead_time_days, valid_until)
VALUES ('77777777-0000-0000-0000-000000000001', 'o-sup-b', 'o-hotel', 89000, 2100, 10, current_date + 7);
SELECT expect_eq('S5: invited supplier submitted a quote', (SELECT count(*) FROM rfq_quotes), 1::bigint);
ROLLBACK;
BEGIN; SET LOCAL ROLE horeca_app; SELECT actor('u-p-owner', 'o-sup-p', 'supplier', 'owner');
SELECT expect_eq('S5: NOT invited supplier does not see the RFQ', (SELECT count(*) FROM rfq_requests), 0::bigint);
SELECT expect_fail('S5: NOT invited supplier cannot quote',
  $$INSERT INTO rfq_quotes (rfq_id, supplier_org_id, buyer_org_id, unit_price_cents, vat_rate_bps, lead_time_days, valid_until)
    VALUES ('77777777-0000-0000-0000-000000000001', 'o-sup-p', 'o-hotel', 1, 2100, 1, current_date)$$);
ROLLBACK;
SELECT 'ALL STRETCH RLS TESTS PASSED' AS result;
