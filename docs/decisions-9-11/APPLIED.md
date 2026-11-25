# APPLIED — what changed after decisions 9–11 (read before implementing)

The files in this folder are Member B's deliverable of 24.11.2026 and are **deliberately left unedited**. Since then, Member A's review, decisions A–J and two independent reviews (Fable, rounds 1 and 2) changed parts of them. **Where this file and the folder disagree, this file wins.** Task IDs refer to the current `TASKS.md`.

> **Decision 012 (25.11.2026) overrides parts of §1–§3 below.** Items it replaces are marked **⟶ 012 §n**; the replacement is in **§4 Decision 012 overrides** at the end of this file. Where §4 and §1–§3 disagree, §4 wins; where §4 and `docs/decisions/012-purchase-modes-payments-stock.md` disagree, the decision file wins.

## 1. Accepted from the deliverable (into the planning documents)
| Item | Where it lives now |
|---|---|
| Money model: buyers pay the platform; one pro-forma per order; suppliers cannot download it (F1, F5) **⟶ 012 §2, §5:** three purchase modes per sub-order; the pro-forma covers only the platform part and exists only if there is one; suppliers still cannot download it | README, CLAUDE.md (project, rule 7, glossary), DESIGN.md |
| Invariant payable + commission = sub-order **gross** (F2) | CLAUDE.md rule 7 + testing; TASKS D9-B2 |
| Payment records: buyer payments / refunds, supplier payouts / adjustments (F3) **⟶ 012 §4:** receipts / refunds are inserted by the worker from gateway events; the manual "record buyer payment" screen is removed; payouts / adjustments stay, `commission_payment` is added | TASKS D11-B1, D11-B2, D11-A2, D13-A2 |
| Three database logins + `DATABASE_WORKER_URL` (F6) | CLAUDE.md rule 2; README env + server; TASKS D2-A3, D2-B1, D4-B2 |
| Ledger entries written in the checkout transaction (F7) | TASKS D9-B1 |
| 404 / 403 / 409 / 422 responses (9.3) | CLAUDE.md rule 6 |
| Identity ERD (F8) | `docs/diagrams/01-erd-complete` |

## 2. Overrides by task — what to do differently from the drafts

### D2-B1 · migrations
- Migration 0000 creates **only `ltree`**. `pg_trgm` and the trigram index on `products.name` in `catalogue.ts` are **dropped** (search is Meilisearch; nothing uses them).
- The three logins are **not** created by `rls.sql`. A Postgres **init shell script** creates `horeca_owner` (non-superuser, owns the database), `horeca_app` and `horeca_worker` with LOGIN and passwords from env. Migrations run as `horeca_owner` and only **grant**.

### D2-B2 · identity migration + registration
- **Grants come with the tables.** The migration that creates the Better Auth tables and `org_profiles`, `supplier_profiles`, `buyer_locations` also grants what `rls.sql` §3 gives `horeca_app` and `horeca_worker` on them. Without this, `horeca_app` gets "permission denied for table user" (reproduced) and register/login fail at G0. `ENABLE ROW LEVEL SECURITY` and the policies come on D4. The same applies to every later migration: **a new table ships with its grants**.
- **⟶ 012 §8:** registration creates **buyer** organizations only; suppliers are created by the admin (see §4 · D5-B1). The mechanics below are unchanged for buyers.
- **Registration (`org.register`):** Better Auth's server API creates the user (and its credentials); then **one of our transactions** inserts the `organization` and `member` rows **directly** (Drizzle on the Better Auth tables, text IDs generated the same way Better Auth does — verify its ID format), sets the RLS context to the **new organization** (`app.org_id`, type, role `owner`), inserts `org_profiles` ~~(+ `supplier_profiles` for suppliers)~~ (buyers only — 012 §8), and finally sets the session's active organization through Better Auth's API. We do not use Better Auth's `organization/create` endpoint (it is disabled: `allowUserToCreateOrganization: false`). A user without an organization lands on "Complete company setup", which runs the same transaction.

### D2-B4 · pg-boss (replaces BullMQ / Redis / `afterCommit()`)
- The **migrate** entry (as `horeca_owner`) installs the pg-boss schema and **creates the queues**.
- Web and worker start pg-boss with `migrate: false`; web additionally without supervision and scheduling (send only).
- Grants on the pg-boss schema: `horeca_app` — what *sending* needs; `horeca_worker` — what *fetching / completing* needs. **Check the exact grants against the pinned pg-boss version** and write them into the migration (time-box 45 min; fallback: the worker gets everything on the pg-boss schema, narrowed later).
- CI and Testcontainers create the database through the **migrate entry**, not plain Drizzle migrations — otherwise the pg-boss tables are missing.
- `enqueue(tx, …)` passes the Drizzle transaction to pg-boss, so a job exists exactly when the data commits. **Test:** a rolled-back transaction leaves no job.
- pg-boss tables have **no RLS**: payloads carry **IDs only**; every processor re-reads and re-checks state.
- **No heartbeat table.** The worker counts as degraded when the oldest waiting job is older than 5 minutes.

### D3-B1 · seed — which login
- **Users** (platform admin, demo users) are created through **Better Auth's server API** — never with hand-made password hashes — also when `REGISTRATION_OPEN=false`.
- Reference data (platform organization, organization / member / profile rows for seeded users, categories, attribute definitions, settings): seed connection as `horeca_owner`.
- Seeded **orders** (D12-B3) go through `createOrder` and `transition` with `withTx(actor)` as `horeca_app` — real actors, real RLS.
- `settings.invoice_due_days` is **one integer (8)**, not the object `{proforma: 3, bank_transfer: 15}` in the drafts. ~~`bank_transfer` differs from `proforma` only in its label.~~ **⟶ 012 §4:** `orders.payment_method` is removed; there are no payment methods, only the mode per sub-order. `settings.vat_rates_bps` = `[2100, 1500, 700, 0]`.

### D3-B2 · catalogue
- `product_images`: **drop `thumb_key`**; the image job writes 3 WebP sizes (320 / 640 / 1280 px) found by convention (`<image id>/<width>.webp`); keep `original_key`, `status`, `width`, `height`. Paths are on the media volume. Upload goes **through the app** (route handler), not a presigned PUT (decision 10.6 superseded).
- No trigram index (see D2-B1).
- Tax ID check in `org_profiles`: accept **8 or 13 digits**.

### D4-B1 · orders & money
- ~~Payment model as the brief describes, unless the mentors object by Thu 26.11 09:00.~~ **⟶ 012 §1–§4:** the mentors decided on three purchase modes; see §4 · D4-B1.
- **Checkout locks only `cart_items … FOR UPDATE`.** `SELECT … FOR SHARE` on `products` / `org_profiles` returns **0 rows** for a buyer under RLS (Postgres applies UPDATE policies to row-locking selects — reproduced). Revalidate inside the transaction instead. Decision 11.8 step 3 and `12-checkout-sequence.mmd` are corrected accordingly.
- **Invoice numbers: a normal sequence**, no gapless counter. Keep the function name `app.next_invoice_number()` and give it a sequence inside (`nextval('invoice_number_seq')`, formatted `PF-<year>-<6 digits>`), so the checkout code and most tests stay as written. Drop the `invoice_counters` table. A rollback may leave a gap — fine for a pro-forma.
- **No re-issue job.** Keep the `version` column (always 1 in the MVP); after a cancellation the stored PDF keeps the original total and the order page shows the amount due.
- **Ledger:** supplier balance (Σ entries) + commission per supplier; the pending / earned / ready-for-payout split is not built. **⟶ 012 §4:** new entry type `commission_payment` and per-mode booking rules (§4 · D4-B1).
- ~~**Audit log** only for supplier approvals, commission changes, buyer payments / refunds and payouts.~~ **⟶ 012 §4, §8:** audit log for supplier creation by the admin, commission changes, payouts / adjustments, commission payments, and payment receipts / refunds (written by the worker with `actor_user_id IS NULL`, which `audit_log_worker_insert` already allows).

### D4-B2 · `rls.sql` as a migration — exact edits
Apply `rls.sql` (MVP part) with these edits (line numbers refer to the file in this folder):
1. Remove the `CREATE ROLE` block in §1 (logins come from the init script) and `CREATE EXTENSION pg_trgm` in §0.
2. **Line 77:** narrow `GRANT SELECT, INSERT, UPDATE ON … sub_orders` to `GRANT SELECT, INSERT ON sub_orders` + `GRANT UPDATE (status, cancel_reason, cancelled_by_user_id, status_changed_at) ON sub_orders TO horeca_app` (verified in round 1: all 78 checks still pass, the money-column update is denied).
3. **Line 82:** remove the `REVOKE … invoice_counters` line.
4. **Line 88:** worker grant on `product_images` becomes `GRANT UPDATE (status, width, height)` (no `thumb_key`).
5. **Line 89:** keep `GRANT UPDATE (status, storage_key, pdf_generated_at) ON proforma_invoices TO horeca_worker`; the worker no longer inserts new versions (drop `INSERT` there and the `proforma_invoices_worker_insert` policy).
6. **Line 113:** remove `ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY`.
7. **Lines 348–357:** replace the body of `app.next_invoice_number()` with the sequence version (keep `SECURITY DEFINER`, the buyer-context check and the grants at lines 403–404); create `invoice_number_seq` owned by `horeca_owner`.
8. The grants already moved into the D2-B2 / D3-B2 migrations are not repeated.

**`tests/rls_tests.sql` — edits:**
- **Line 109:** correct the comment — "lock + revalidate: only `cart_items` is locked (`FOR SHARE` on products would return 0 rows under RLS)"; add a check that `SELECT … FROM products … FOR SHARE` as the buyer returns 0 rows, so the reason stays documented.
- **Line 133:** unchanged (the function name stays).
- **Lines 146, 162, 165:** replace the three gapless checks (direct counter access; "rollback reuses the same number") with: "two checkouts get different numbers" and "the number has the format `PF-<year>-NNNNNN`".
- Remove `thumb_key` from any image fixtures.
Run the edited test file via `psql` in CI **against the real migrations**: init script → migrate entry (Drizzle migrations + pg-boss schema) → `psql -f rls_tests.sql` as the superuser. Do **not** use `run_db_tests.sh` in CI — it builds the database from the drafts in `drizzle/mvp/*.sql` (which still contain `invoice_counters`, `thumb_key` and the trigram index). Adapt the fixture rows for `user`, `organization` and `member` to the columns the Better Auth CLI generates (D2-B2).

### D6-B2 · stuck CSV imports
The worker login has only SELECT on `csv_imports`, so status changes happen in the **supplier's context**: the import job runs as `horeca_app` with the supplier actor (captured at enqueue time) and sets `failed` on error; an import still "running" after 30 minutes is marked failed when the supplier opens the imports page or starts a new import; Cancel is a supplier action. CSV: decimal comma only in `;` files.

### D7 · catalogue browsing
Buyers only in the MVP: the matrix row "Browse catalogue" is buyer + platform-for-moderation via admin screens; suppliers do not browse. Attribute definitions come from the seed (no editor); ~~supplier approve / reject only in the UI (suspend / reinstate / re-apply rules stay in the database, screens are on the "after the project" list).~~ **⟶ 012 §8:** no approve / reject / re-apply flow — the admin creates suppliers as `approved`; suspend / reinstate rules stay in the database, their screens stay on the "after the project" list.

### §9.7 · rate limits
No Redis: Better Auth's built-in limiter (defaults + one sign-in rule, client-IP header configured); one active CSV import per supplier (database rule). The AI limits of S3/S4 are decided on D16 (one small usage table).

### Packages
Pin exact versions (the drafts' `package.json` uses `^` ranges).

## 3. Mentor questions
Now named **M1–M5** (M1 payment model = old Q4, M2 = Q3, M3 = Q6, M4 = Q7, M5 = VAT/PIB), phrased as confirmations — see `MENTOR-QUESTIONS.md`. **⟶ 012 §1:** all five answered on 25.11; the new open points are 012 §14.

## 4. Decision 012 overrides
Source: [`docs/decisions/012-purchase-modes-payments-stock.md`](../decisions/012-purchase-modes-payments-stock.md) §4–§8, §12. Line numbers refer to `schema/rls.sql` in this folder. Every changed policy, guard or function gets its RLS tests updated in the same task; `tests/rls_tests.sql` may now also be edited as listed here. **Open** = 012 does not say how; decide in that task and record it here.

### D2-B2 · registration (buyers only)
- `org.register` creates **buyer** organizations only; the registration form has no supplier choice. Public registration can never create a supplier (enforced again by the guard in D4-B2).

### D4-B1 · order-core migration (from `schema/orders.ts`, `schema/finance.ts`)
- **`sub_orders.mode`**: new enum `purchase_mode` = `direct | platform`, `NOT NULL`. `direct` only when the buyer–supplier agreement is `active` **when the checkout transaction runs** (revalidated inside it).
- **`sub_orders.supplier_submission`**: new enum `pending | accepted | rejected | failed`. **Open:** it is written by the worker after commit / after payment, so `horeca_worker` needs `GRANT UPDATE (supplier_submission)` on `sub_orders` and an UPDATE policy; 012 does not list them.
- **`orders.payment_method` removed** (enum `payment_method` dropped; mode is per sub-order). The S6 seam note on it in `orders.ts` no longer applies.
- **`order_payment_status`** enum gains **`not_applicable`** (orders with no platform sub-order). `sub_orders.order_payment_status` (the supplier's copy) uses the same enum.
- **Keep `order_payments` and `app.recompute_order()`** with their tests. One change in `recompute_order` (lines 374–401): `v_due` sums only **`mode = 'platform'`** non-cancelled sub-orders; if the order has **no** platform sub-order, `v_pay := 'not_applicable'`.
- **Ledger** (`ledger_entry_type` + policies, lines 312–336):
  - New entry type **`commission_payment`**; `ledger_entries_sign` check: `commission_payment > 0`.
  - `ledger_insert_checkout` (line 316): additionally **refuses `sale` for a direct sub-order** (`NOT (type = 'sale' AND s.mode = 'direct')`). Direct checkout books only `commission` = −commission.
  - `ledger_insert_reversal` (line 325): **open** — 012 says direct cancellation books only `commission_reversal`; add the matching refusal of `sale_reversal` for direct so "cancelled sub-order sums to 0" holds.
  - `ledger_insert_platform` (line 335): `type IN ('payout', 'adjustment', 'commission_payment')`.
  - Invariants (tests): platform `payable + commission = gross`; direct sub-order entries sum to **−commission**; cancelled sub-orders sum to 0; a supplier balance **may be negative** (no check constraint against it).
- **Pro-forma** (`proforma_invoices`): created once at checkout **only if the order has a platform part**; its totals = the **platform sub-orders**, not the order totals; never changed afterwards. "Paid" is shown on the order page, not in the PDF.
- Commission formula unchanged; charged per sub-order in **both** modes.

### D4-B2 · `rls.sql` migration — identity policy / guard edits (in addition to the §2 edits)
- `org_profiles_insert` (line 131): `WITH CHECK (organization_id = app.org_id() OR app.is_platform())`.
- `supplier_profiles_insert` (line 163): `WITH CHECK ((organization_id = app.org_id() AND app.is_supplier()) OR app.is_platform())`. **Open:** with only the platform creating suppliers, the first branch may be dropped.
- `app.org_profiles_guard()` (lines 137–156), INSERT branch: a **supplier** profile may be inserted **only by the platform and only as `approved`**; a buyer profile stays `approved` on insert. The `rejected → pending` re-apply exception in the UPDATE branch no longer has a flow — **open:** remove it or leave it unused.
- Optional second layer (012 §4): `sub_orders_insert` (line 261) requires an `active` agreement for `mode = 'direct'` — needs `supplier_agreements`, so it lands with D5-B0.
- Optional second layer (012 §4, M2): `sub_orders_update_supplier` (line 265) refuses `status = 'shipped'` unless `mode = 'direct'` or `order_payment_status = 'paid'`.
- Tests about **pending suppliers and re-apply** in `rls_tests.sql` are replaced by: "public registration cannot insert a supplier profile", "the platform inserts a supplier profile as `approved`", "the platform cannot insert one as `pending`".
- `order_payments_worker_insert` (line 475, today in the stretch block): **open** — 012 has the worker insert a **`refund`** row too, but the draft policy allows only `type = 'receipt'`. Widen to `type IN ('receipt', 'refund')` when the policy moves into the MVP (D5-B0).

### D5-B0 · second migration — ERD freeze D5 evening
- **`supplier_agreements`** (012 §3): `id`, `buyer_org_id`, `supplier_org_id`, `status` (`requested` → `active` | `rejected`; `active` → `ended`), `payment_term_days` (optional), `buyer_note`, `supplier_note`, `requested_by_user_id`, `decided_by_user_id`, `requested_at`, `decided_at`, `ended_at`. No `kind` column.
  - Partial unique index: at most one `requested` or `active` row per (buyer, supplier).
  - Buyer inserts only `status = 'requested'`; UPDATE limited by a **column grant** to the status / decision fields; the supplier confirms.
  - RLS: rows with own `buyer_org_id` or own `supplier_org_id`; platform read. Policies = `agreement.request` (buyer members), `agreement.accept` / `.reject` (supplier members), `agreement.end` (owner of either side), `agreement.view` (both sides; platform read).
  - Grants + RLS tests in the same migration.
- **`payments`** + **`payment_events`** move from the stretch block (`schema/stretch.ts` lines 123–155, `rls.sql` lines 460–476) into the MVP, with these changes:
  - `payment_status` enum gains **`expired`** (`created → pending → succeeded | failed | cancelled | expired`); at most one `succeeded` per order.
  - **`payments.refunded_cents`** (`bigint`, ≥ 0, ≤ amount); worker column grant extended to `refunded_cents`.
  - `payment_events`: duplicate provider event ID → no-op (unique index, as in the stretch draft).
  - FK `order_payments.payment_id → payments` (the "S6 migration" note in `stretch.ts` line 155).
  - The stretch RLS tests for payments (`tests/rls_stretch_tests.sql`, S6 part) move into the MVP test run.
- **`product_stock`**: `product_id`, `available_qty`, `status` (`ok` | `unknown`), `fetched_at`; read policy for logged-in users; written only by `horeca_worker`.
- **`app.system_cancel_sub_order(id, reason)`**: `SECURITY DEFINER`, `EXECUTE` granted **to `horeca_worker` only** (revoked from PUBLIC). Sets `cancelled` + reason, writes the `sub_order_events` row, books the reversals for the sub-order's mode, calls `app.recompute_order()`. Used by payment expiry and supplier-API rejection. RLS tests: `horeca_app` cannot execute it; reversals sum the sub-order to 0.
- Stretch tables still later: `price_tiers`, `buyer_prices`, `rfq_*`.

### D5-B1 · supplier onboarding by the admin (replaces approve / reject)
- The admin creates organization + `org_profiles` (`approved`) + `supplier_profiles` + owner user through a Better Auth **server API that does not start a session** (test: the admin stays logged in as the admin). Organization / member rows are inserted the same way as in registration (§2 · D2-B2).
- A set-password link with a longer lifetime goes to Mailpit **and is shown once to the admin**. Audit entry: supplier created.

### D9-B1 · checkout
- Stock check per supplier **in the request, before the transaction** (2–3 s timeout). API down → that supplier group cannot be ordered; the others can.
- Inside the transaction only our own data is revalidated (incl. the agreement for `direct`). Locking unchanged: `cart_items … FOR UPDATE` only.
- Ledger per mode as in D4-B1. Pro-forma only for the platform part. Direct sub-orders are submitted to the supplier API **after commit** (job); platform sub-orders after `payment.succeeded`.

### D11-B2 / D12-B1 · payments and cancellation
- Callback route handler (web): verify HMAC-SHA256 on the raw body (constant time, timestamp tolerance) → enqueue **one job** → 200; non-2xx if our `payments` row does not exist yet.
- Worker (system login) processes the event: insert `payment_events` (duplicate → no-op), check amount + currency, update `payments`, insert the `order_payments` `receipt` / `refund`, call `app.recompute_order()`, submit platform sub-orders, enqueue e-mails.
- **Expiry:** an unpaid platform part expires after 30 min; the job first asks the gateway (`GET /payments/{id}`), then cancels via `app.system_cancel_sub_order`.
- **Buyer cancellation** of a platform sub-order is refused while a payment is `pending` (domain check; 409).
- **Refunds** only by cancelling a **paid** platform sub-order before shipping, for that sub-order's gross. Reversals are booked at cancellation; the refund callback only records the `refund` row and `refunded_cents`. No admin refund action.
- `subOrder.ship` requires `paid` for platform sub-orders (M2); confirming before payment is allowed.

### D11-B1 / D13-A2 · commission payments (direct mode)
- The admin records a supplier's commission payment as a ledger entry `commission_payment` (+amount), audited. Replaces the "record buyer payment / refund" panel.
- **Netting** of direct-mode commission against platform payouts: default per 012 §2, still to confirm with the mentors (012 §14.4).

### Removed by 012
Supplier self-registration · approval queue · pending banner · approve / reject / re-apply flows · manual "record buyer payment / refund" · `orders.payment_method` · stretch S6 (now MVP).
