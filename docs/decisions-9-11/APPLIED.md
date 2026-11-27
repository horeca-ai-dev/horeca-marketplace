# APPLIED — what changed after decisions 9–11 (read before implementing)

The files in this folder are Member B's deliverable of 24.11.2026 and are **deliberately left unedited**. Since then, Member A's review, decisions A–J and two independent reviews (Fable, rounds 1 and 2) changed parts of them. **Where this file and the folder disagree, this file wins.** Task IDs refer to the current `TASKS.md`.

> **Decision J (media on a Docker volume) is superseded by [decision 013](../decisions/013-s3-compatible-storage-garage.md) (26.11.2026):** media lives in S3-compatible storage (self-hosted Garage) and is accessed only through the S3 API; the object-key convention (`products/<image id>/…`, `invoices/<order id>.pdf`) stays, so "paths on the media volume" below means object keys in the bucket.

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
- **⟶ 012 §8:** registration creates **buyer** organizations only; suppliers are created by the seed and by the admin (see §4 · D16-B0). The mechanics below are unchanged for buyers.
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

### D5-B5 · listMyOrganizations + member read policy (`my-organizations.ts`, migration `0007_member_read_org_profiles.sql`; issue #63)
For the organization switcher (D7-A3). `listMyOrganizations(tx, actor)` takes no input and lists the organizations of `actor.userId` with type, legal name and `active`. **Decided in D5-B5 (27.11):**
- **RLS approach (a):** a new policy `org_profiles_read_member` — a user may read the profile of every organization they are a **member** of (`EXISTS` on `member` by `app.user_id()`); policies are OR-ed, so it only **adds** visibility and only for the user's own memberships. Read only: the UPDATE policy and the guard trigger are untouched, so a member of a second organization still cannot change its profile (RLS test). `member` has no RLS and `horeca_app` already reads it (Better Auth uses that login); the lookup is served by `member_userId_idx` / `member_organizationId_idx`. Rejected: (b) N context switches in one transaction (easy to leave the context wrong) and (c) a `SECURITY DEFINER` function (a third pattern). `loadActor` is unchanged — it still sets the context to the one organization it has just verified.
- **Authorization:** the existing `org.switchActive` row (everyone) — listing exists only so the user can switch, so no new `org.listMine` row.
- **Same rules as `loadActor`:** a membership whose organization has no profile, or whose role is not `owner` / `member`, is left out. Order = oldest membership first, as in `defaultOrganizationId` (where a new session starts).
- **Switching is Better Auth's `/organization/set-active`** — no Server Action. Verified against 1.7.20 (integration test `org-switch.test.ts`): a valid switch works and `loadActor` then yields that organization's actor; an organization the user does not belong to — another tenant's or non-existent — is refused with **403**; **and Better Auth then CLEARS the session's active organization** (it sets it to `null` before throwing, `organization/routes/crud-org.mjs`) — fail closed, but the session does **not** keep the old one. The app then treats the user as "no organization" and sends them to `/complete-setup`, which cannot help (`ALREADY_HAS_COMPANY`) until they log in again. The switcher offers only the user's own organizations, so this needs a stale list or a forged request; D7-A3 should still handle it (re-select an own organization after a failed switch, or make `resolveSession` fall back to the oldest membership as the session-create hook does).

### D5-B2 · category services (`categories.ts`, `category-tree.ts`; issue #69)
Read-only: `listCategoryTree`, `getCategory` (breadcrumb + effective attributes), `listLeafCategories` (for pickers) — the admin edits categories in D14. New policy action **`category.view`** (B\*, S\*, P). The attribute-definition loader moved here from `products.ts` (`loadAttributeDefinitions`), so the product services validate against exactly what the forms and filters show; the Zod schema generated from the definitions (`attributes.ts`) came with D5-B3a. **Decided in D5-B2 (27.11):**
- **Effective attributes** = the category's own definitions plus every ancestor's (no overrides), ancestors first, then by `position`; each carries `inherited` and the `categoryId` that defines it.
- **Inactive means gone:** an inactive category hides its **whole subtree** from everybody but the platform (`NotFound` for `getCategory`), and an inactive attribute definition is shown to the platform only.
- **`isLeaf` = no sub-category at all, active or not** — a category whose children are all inactive is not a leaf, because products live on leaf categories (the same rule `assertActiveLeafCategory` uses).
- The whole table is read in one query and the tree is built in plain code (`category-tree.ts`, unit-tested): it has a few dozen rows and 3 levels. Siblings are ordered by `position`, then by name in the Montenegrin alphabet.
- **API shape for the UI** is a nested tree plus a flat leaf list; if D6/D7 need another shape (e.g. a category subtree for the search filter), it is a small change here.

### D5-B4 · company self-service (`org-profile.ts`, `buyer-locations.ts`, `bank-details.ts`, `actions/company.ts`; issue #65)
Domain functions `(tx, actor, input)` + thin Server Actions for the company pages (D5-A3). No new policy rows: `orgProfile.*`, `supplierProfile.*` and `buyerLocation.*` were already in the matrix. Every function works on `actor.orgId` — **no organization id in any input** (rule 3). **Decided in D5-B4 (27.11):**
- **Error codes:** `Conflict` reasons are `TAX_ID_TAKEN` (existing) and the new `DEFAULT_LOCATION_ARCHIVE`. A non-platform tax-ID change is a plain **`Forbidden` (403)** and a bad IBAN is a **`Validation` (422)** with the field error on `iban` — reasons exist only on 409, so `TAX_ID_PLATFORM_ONLY` and `INVALID_IBAN` from the issue are not separate codes (the form shows the tax ID read-only for non-platform anyway).
- **Profile:** edited with the registration `companySchema` as a full replace; only the owner (member → 403); saving unchanged values writes nothing and logs nothing; a change writes **one audit entry with only the fields that changed** (old and new value) in the same transaction. Type and status are not editable. The platform edits **its own** organization only; other organizations' profiles need an explicit platform-only target and belong to the admin screens (D16).
- **Locations:** the first location is the default by itself; `makeDefault` swaps the default in one transaction (old one off first, because of `buyer_locations_one_default_uq`; the default row is locked, a lost race is a 409). `makeDefault: false` on the current default does nothing — the default changes only by making another one default, so an organization with locations always has one. The **default cannot be archived** (also when it is the only one — it can still be edited); archiving twice is fine; an archived location cannot be edited; nothing is deleted.
- **Bank details:** owner only (member → 403, also by RLS); IBAN = Montenegrin, `ME` + 20 digits = 22 characters, mod-97 check (**verify** against the registry before a real launch); pasted spaces / dashes / lower case are normalized. The **audit entry stores the IBAN masked** (`ME25…8951`), never the whole number. The platform has no supplier profile of its own, so it gets NotFound — its view of suppliers' bank details is an admin-screen job (D13).
- The seed's demo IBANs (`ME25000000000000000002` …) are **not valid** on purpose, so a demo supplier has to type a valid one when editing.

### D5-B3a · product services (`src/server/domain/products.ts`)
`createProduct`, `updateProduct`, `setProductStatus`, `getProduct`, `listProducts` — all `(tx, actor, input)`, input validated again in the domain (`src/lib/schemas/product.ts`, strict), attribute schema generated from the category's definitions (`attributes.ts`). **Decided in D5-B3a (27.11):**
- **Status machine** (`product-status.ts`): `draft ⇄ active`, `draft | active → archived`, `archived → draft` (restore) — never straight from `archived` to `active`.
- **Required attributes only matter for `active`:** a draft may be incomplete; activating — and editing a product that is already active — needs every required attribute.
- **The SKU never changes after creation** (it is the key of the CSV upsert and is copied into order lines); a duplicate is `Conflict` with the new reason `SKU_TAKEN`. An update replaces all editable fields (no partial patch).
- **An archived product cannot be edited**, only restored to `draft`.
- **Attribute values of a definition the admin has deactivated are kept** on update (existing data survives); they cannot be set or changed by the supplier.
- A **suspended supplier gets a `Conflict` (409)** on create / update / status change — RLS would only answer "0 rows".
- `getProduct` follows RLS visibility (own in any status; others' only when active and the supplier is approved); `listProducts` is the supplier dashboard (own products, status filter, SKU / name search with `%` and `_` escaped, paging) and reads Postgres only (rule 12).
- **Not included:** the Meilisearch sync job (D7-B3 enqueues it in these transactions), Server Actions, screens, image upload (D6-B0).

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
- **`sub_orders.supplier_submission`**: new enum `pending | accepted | rejected | failed`, written by the worker after commit / after payment. **Decided (012 §4, amended):** `GRANT SELECT, UPDATE (supplier_submission) ON sub_orders TO horeca_worker` + policy `sub_orders_worker_update FOR UPDATE TO horeca_worker USING (true) WITH CHECK (true)`. RLS cannot restrict columns — the **column grant** is what limits the worker to `supplier_submission`; RLS test: the worker cannot update `status` or any money column. Lands with the D4-B2 policy migration.
- **`orders.payment_method` removed** (enum `payment_method` dropped; mode is per sub-order). The S6 seam note on it in `orders.ts` no longer applies.
- **`order_payment_status`** enum gains **`not_applicable`** (orders with no platform sub-order). `sub_orders.order_payment_status` (the supplier's copy) uses the same enum.
- **Keep `order_payments` and `app.recompute_order()`** with their tests. One change in `recompute_order` (lines 374–401): `v_due` sums only **`mode = 'platform'`** non-cancelled sub-orders; if the order has **no** platform sub-order, `v_pay := 'not_applicable'`.
- **Ledger** (`ledger_entry_type` + policies, lines 312–336):
  - New entry type **`commission_payment`**; `ledger_entries_sign` check: `commission_payment > 0`.
  - `ledger_insert_checkout` (line 316): additionally **refuses `sale` for a direct sub-order** (`NOT (type = 'sale' AND s.mode = 'direct')`). Direct checkout books only `commission` = −commission.
  - `ledger_insert_reversal` (line 325): **decided (012 §4, amended)** — refuses `sale_reversal` for a direct sub-order (`NOT (type = 'sale_reversal' AND s.mode = 'direct')`), so a cancelled direct sub-order books only `commission_reversal` and sums to 0. RLS test: `sale_reversal` for a direct sub-order is denied.
  - `ledger_insert_platform` (line 335): `type IN ('payout', 'adjustment', 'commission_payment')`.
  - Invariants (tests): platform `payable + commission = gross`; direct sub-order entries sum to **−commission**; cancelled sub-orders sum to 0; a supplier balance **may be negative** (no check constraint against it).
- **Pro-forma** (`proforma_invoices`): created once at checkout **only if the order has a platform part**; its totals = the **platform sub-orders**, not the order totals; never changed afterwards. "Paid" is shown on the order page, not in the PDF.
- Commission formula unchanged; charged per sub-order in **both** modes.
- **Decided in D4-B1 (26.11):**
  - **`orders.payment_status` rule** (replaces the special case "no platform sub-order" in `recompute_order`; written into the function in D4-B2 and into `money.ts`): `amount_due` = Σ gross of non-cancelled `platform` sub-orders; `amount_paid` = Σ receipts − Σ refunds; **`refund_due`** if `amount_paid > amount_due` · **`not_applicable`** if `amount_due = 0` · **`paid`** if `amount_paid = amount_due` · otherwise **`unpaid`**. It differs from the older wording only when the order *has* platform sub-orders but all are cancelled: "nothing to pay" is shown, not "unpaid".
  - **Split of the work:** D4-B1 (migration 0004) = tables, enums, the `order_number_seq` sequence, constraints, grants and the `settings` seed; the policies, `app.recompute_order()`, `app.next_invoice_number()` (+ `invoice_number_seq`) and `app.resolve_commission_bps()` are **D4-B2** (they live in `rls.sql`).
  - **`horeca_app` keeps INSERT on `order_payments`** (as in `rls.sql` §3), because the unchanged `rls_tests.sql` records a payment as the platform; no screen uses it. The worker's INSERT on `order_payments` and its policy come with D5-B0 together with `payments`.
  - **`sub_orders.order_payment_status` and `orders.payment_status` default to `unpaid`**; the checkout (D9-B1) calls `app.recompute_order()` after inserting, which sets `not_applicable` for a direct-only order.
  - **Settings seed** (`src/server/db/seed/settings.ts`, adds only what is missing): `default_commission_bps` 800, `vat_rates_bps` `[2100,1500,700,0]`, `invoice_due_days` 8, `platform_company` (fictional).

### D4-B2 · `rls.sql` migration — identity policy / guard edits (in addition to the §2 edits)
- `org_profiles_insert` (line 131): `WITH CHECK (organization_id = app.org_id() OR app.is_platform())`.
- `supplier_profiles_insert` (line 163): **decided (012 amendment)** — `WITH CHECK (app.is_platform())`. The supplier branch is dropped: suppliers can no longer insert their own profile (only the admin creates suppliers, and the seed runs as the owner). RLS test: a supplier member's insert into `supplier_profiles` is denied.
- `app.org_profiles_guard()` (lines 137–156), INSERT branch: a **supplier** profile may be inserted **only by the platform and only as `approved`**; a buyer profile stays `approved` on insert. **Decided (012 amendment):** the `rejected → pending` re-apply exception in the UPDATE branch is **removed** — any status change by a non-platform caller raises. RLS test: a supplier cannot move its own profile from `rejected` to `pending`.
- Optional second layer (012 §4): `sub_orders_insert` (line 261) requires an `active` agreement for `mode = 'direct'` — needs `supplier_agreements`, so it lands with D5-B0.
- Optional second layer (012 §4, M2): `sub_orders_update_supplier` (line 265) refuses `status = 'shipped'` unless `mode = 'direct'` or `order_payment_status = 'paid'`.
- Both decisions above are dead code after 012; **Member B confirms them with the RLS tests on D4** (D4-B2).
- Tests about **pending suppliers and re-apply** in `rls_tests.sql` are replaced by: "public registration cannot insert a supplier profile", "the platform inserts a supplier profile as `approved`", "the platform cannot insert one as `pending`".
- `order_payments_worker_insert` (line 475, today in the stretch block): **decided (012 §4, amended)** — `WITH CHECK (type IN ('receipt', 'refund') AND payment_id IS NOT NULL AND recorded_by_user_id IS NULL)`; moves into the MVP with D5-B0. RLS tests: the worker can insert a refund with a `payment_id`, not one without.
- **Decided in D4-B2 (26.11)** (migration `0005_rls.sql`, tests `tests/rls_tests.sql` run by `scripts/test-rls.sh` / `pnpm test:rls`, also in CI):
  - **Second layer for shipping is in:** `sub_orders_update_supplier` refuses `status = 'shipped'` unless `mode = 'direct'` or `order_payment_status = 'paid'` (012 §4, M2). With `refund_due` a platform sub-order cannot be shipped either — the order is not in a clean paid state.
  - **Checkout cannot choose system fields:** `orders_insert` requires `status = 'in_progress'` and `payment_status = 'unpaid'`; `sub_orders_insert` requires `supplier_submission = 'pending'` and `order_payment_status = 'unpaid'` (the web login has INSERT on the whole table, so the policy is what stops a forged "already accepted / paid"). The checkout calls `app.recompute_order()` afterwards.
  - **Ledger policies by mode:** `ledger_insert_checkout` refuses `sale` for a `direct` sub-order, `ledger_insert_reversal` refuses `sale_reversal` for it, `ledger_insert_platform` allows `payout`, `adjustment`, `commission_payment`. The `commission` row is written in both modes, also when it is 0.
  - **`app.recompute_order()`** uses the D4-B1 `payment_status` rule (same as `paymentStatus()` in `money.ts`); `refund_due` is checked before `not_applicable`, so a paid order whose platform parts were all cancelled shows `refund_due`.
  - **`org_profiles_guard`:** one initial status for everybody — `approved`; a supplier profile only from the platform; no status change by a non-platform caller. `rls_tests.sql` keeps one `pending` and one `rejected` supplier as **legacy fixtures** (inserted by the superuser), to test visibility and the "no re-apply" rule.
  - **Not in 0005 (needs tables of D5-B0):** the active-agreement check on `mode = 'direct'`, the worker's INSERT policy on `order_payments`, `payments` / `payment_events`, `app.system_cancel_sub_order`.
  - **How the tests run:** `scripts/test-rls.sh` creates a throwaway database, runs the real migrate entry on it, then `psql -f rls_tests.sql` as the superuser through `docker compose exec` (no host `psql` needed), and drops the database.

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
- **Decided in D5-B0 (27.11)** (migration `0006_agreements_payments_stock.sql`; RLS tests: section 9 of `tests/rls_tests.sql`; the S6 checks of `rls_stretch_tests.sql` moved there). **The ERD is frozen from here — a later change needs an ADR (G1).**
  - **Bug fixed in 0004's `order_payments`:** `payment_id` was `UNIQUE`, so a refund could never sit next to its receipt. Replaced by a partial unique index — one **receipt** per payment, any number of refunds (a refund per cancelled platform sub-order). Duplicate refund events are stopped by `payment_events.provider_event_id`.
  - **Contracts:** policies as in 012 §3. RLS cannot compare old / new values, so a **guard trigger** (`app.supplier_agreements_guard`, only for `horeca_app`) allows exactly `requested → active | rejected` (a member of the supplier, in its own name) and `active → ended` (the **owner** of either side); every update must be a status change, so the notes and the term are set together with the decision. A request is accepted only for an **approved** supplier. The platform only reads. `sub_orders_insert` (0005) was replaced: a `direct` sub-order needs an `active` agreement for exactly that buyer and supplier.
  - **`payments`:** the buyer inserts `created` (no refund, no provider ref, for an order that still has a non-cancelled platform sub-order) and, after the gateway answered, marks it `pending` — the **only** update the web login has (column grant `status, provider_ref, updated_at` + a policy that allows exactly `created → pending` with a provider ref), because `createPayment` runs in the web request (rule 11). Everything after that is the worker's (`status, provider_ref, refunded_cents, updated_at`). The amount is the domain's job; `orders.payment_status` is derived from `order_payments`, so a wrong amount cannot make an order "paid". At most one `succeeded` per order; `refunded_cents ≤ amount` and only on a `succeeded` payment.
  - **`payment_events`:** worker only (SELECT + INSERT, so insert-only); the web login has **no** grant — no screen needs it in the MVP (a platform read would be a new migration).
  - **`order_payments_worker_insert`:** `type IN ('receipt', 'refund')`, `payment_id` set, no recording user, and the payment must be `succeeded` for **that** order and buyer; a receipt carries exactly the payment's amount, a refund at most that.
  - **`product_stock`:** `available_qty` is NULL exactly when `status = 'unknown'` (CHECK). Read policy = **the product is visible** (same as `product_images`), stricter than "any logged-in user" so a draft's or a pending supplier's stock does not leak; the worker has SELECT, INSERT, UPDATE (upsert), no DELETE.
  - **`app.system_cancel_sub_order(id, reason)`:** `EXECUTE` for `horeca_worker` only (and it checks its caller too). Cancels from `pending` / `confirmed` with a reason, `cancelled_by_user_id` NULL, writes the `sub_order_events` row (actor NULL), then `recompute_order`. **Already cancelled → no-op** (jobs run twice); shipped / delivered → error. The reversals **mirror the sub-order's own `sale` and `commission` entries**, so they are right for the mode by construction (platform: both, direct: commission only) and the entries always sum to 0.
  - **Permissions:** `agreement.request / .accept / .reject / .end / .view`, `payment.payByCard` (moved from stretch, S6 is MVP) and `payment.view` are in `permission-matrix.md` §2 and `PERMISSIONS`.

### D16-B0 / D16-A0 (was D5-B1 / D5-A3) · supplier onboarding by the admin (replaces approve / reject) — MVP, finished before the G4 freeze
- Until D16 the seed creates the demo suppliers directly as `approved` (D3-B1).
- The admin creates organization + `org_profiles` (`approved`) + `supplier_profiles` + owner user through a Better Auth **server API that does not start a session** (test: the admin stays logged in as the admin). Organization / member rows are inserted the same way as in registration (§2 · D2-B2).
- A set-password link with a longer lifetime goes to Mailpit **and is shown once to the admin**. Audit entry: supplier created.

### D9-B1 · checkout
- Stock check per supplier **in the request, before the transaction** (2–3 s timeout). API down → that supplier group cannot be ordered; the others can.
- Inside the transaction only our own data is revalidated (incl. the agreement for `direct`). Locking unchanged: `cart_items … FOR UPDATE` only.
- Ledger per mode as in D4-B1. Pro-forma only for the platform part. Direct sub-orders are submitted to the supplier API **after commit** (job); platform sub-orders after `payment.succeeded`.

### D11-B2 / D12-B1 / D15-B0 · payments and cancellation
- Callback route handler (web): verify HMAC-SHA256 on the raw body (constant time, timestamp tolerance) → enqueue **one job** → 200; non-2xx if our `payments` row does not exist yet.
- Gateway API (`mock-services`, task D10-B3): `POST /payments`, `GET /payments/{id}`, signed callback with retry, admin "replay last callback" (basic auth), test cards success / declined. Our app reaches it via `PAYMENT_GATEWAY_URL` / `PAYMENT_GATEWAY_API_KEY`; the stock API via `SUPPLIER_API_URL` / `SUPPLIER_API_KEY`.
- Worker (system login) processes the event: insert `payment_events` (duplicate → no-op), check amount + currency, update `payments`, insert the `order_payments` `receipt` / `refund`, call `app.recompute_order()`, submit platform sub-orders, enqueue e-mails.
- **Expiry (D15-B0):** an unpaid platform part expires after 30 min; the job first asks the gateway (`GET /payments/{id}`), then cancels via `app.system_cancel_sub_order`.
- **Buyer cancellation** of a platform sub-order is refused while a payment is `pending` (domain check; 409).
- **Refunds** only by cancelling a **paid** platform sub-order before shipping, for that sub-order's gross. Reversals are booked at cancellation; the refund callback only records the `refund` row and `refunded_cents`. No admin refund action.
- `subOrder.ship` requires `paid` for platform sub-orders (M2); confirming before payment is allowed.

### D11-B1 / D13-A2 · commission payments (direct mode)
- The admin records a supplier's commission payment as a ledger entry `commission_payment` (+amount), audited. Replaces the "record buyer payment / refund" panel.
- **Netting** of direct-mode commission against platform payouts: default per 012 §2, still to confirm with the mentors (012 §14.4).

### Removed by 012
Supplier self-registration · approval queue · pending banner · approve / reject / re-apply flows · manual "record buyer payment / refund" · `orders.payment_method` · stretch S6 (now MVP).
