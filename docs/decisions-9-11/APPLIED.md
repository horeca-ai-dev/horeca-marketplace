# APPLIED — what changed after decisions 9–11 (read before implementing)

The files in this folder are Member B's deliverable of 24.11.2026 and are **deliberately left unedited**. Since then, Member A's review, decisions A–J and two independent reviews (Fable, rounds 1 and 2) changed parts of them. **Where this file and the folder disagree, this file wins.** Task IDs refer to the current `TASKS.md`.

## 1. Accepted from the deliverable (into the planning documents)
| Item | Where it lives now |
|---|---|
| Money model: buyers pay the platform; one pro-forma per order; suppliers cannot download it (F1, F5) | README, CLAUDE.md (project, rule 7, glossary), DESIGN.md |
| Invariant payable + commission = sub-order **gross** (F2) | CLAUDE.md rule 7 + testing; TASKS D9-B2 |
| Payment records: buyer payments / refunds, supplier payouts / adjustments (F3) | TASKS D11-B1, D11-B2, D11-A2, D13-A2 |
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
- **Registration (`org.register`):** Better Auth's server API creates the user (and its credentials); then **one of our transactions** inserts the `organization` and `member` rows **directly** (Drizzle on the Better Auth tables, text IDs generated the same way Better Auth does — verify its ID format), sets the RLS context to the **new organization** (`app.org_id`, type, role `owner`), inserts `org_profiles` (+ `supplier_profiles` for suppliers), and finally sets the session's active organization through Better Auth's API. We do not use Better Auth's `organization/create` endpoint (it is disabled: `allowUserToCreateOrganization: false`). A user without an organization lands on "Complete company setup", which runs the same transaction.

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
- `settings.invoice_due_days` is **one integer (8)**, not the object `{proforma: 3, bank_transfer: 15}` in the drafts; `bank_transfer` differs from `proforma` only in its label. `settings.vat_rates_bps` = `[2100, 1500, 700, 0]`.

### D3-B2 · catalogue
- `product_images`: **drop `thumb_key`**; the image job writes 3 WebP sizes (320 / 640 / 1280 px) found by convention (`<image id>/<width>.webp`); keep `original_key`, `status`, `width`, `height`. Paths are on the media volume. Upload goes **through the app** (route handler), not a presigned PUT (decision 10.6 superseded).
- No trigram index (see D2-B1).
- Tax ID check in `org_profiles`: accept **8 or 13 digits**.

### D4-B1 · orders & money
- Payment model as the brief describes, unless the mentors object by Thu 26.11 09:00.
- **Checkout locks only `cart_items … FOR UPDATE`.** `SELECT … FOR SHARE` on `products` / `org_profiles` returns **0 rows** for a buyer under RLS (Postgres applies UPDATE policies to row-locking selects — reproduced). Revalidate inside the transaction instead. Decision 11.8 step 3 and `12-checkout-sequence.mmd` are corrected accordingly.
- **Invoice numbers: a normal sequence**, no gapless counter. Keep the function name `app.next_invoice_number()` and give it a sequence inside (`nextval('invoice_number_seq')`, formatted `PF-<year>-<6 digits>`), so the checkout code and most tests stay as written. Drop the `invoice_counters` table. A rollback may leave a gap — fine for a pro-forma.
- **No re-issue job.** Keep the `version` column (always 1 in the MVP); after a cancellation the stored PDF keeps the original total and the order page shows the amount due.
- **Ledger:** supplier balance (Σ entries) + commission per supplier; the pending / earned / ready-for-payout split is not built.
- **Audit log** only for supplier approvals, commission changes, buyer payments / refunds and payouts.

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
Buyers only in the MVP: the matrix row "Browse catalogue" is buyer + platform-for-moderation via admin screens; suppliers do not browse. Attribute definitions come from the seed (no editor); supplier approve / reject only in the UI (suspend / reinstate / re-apply rules stay in the database, screens are on the "after the project" list).

### §9.7 · rate limits
No Redis: Better Auth's built-in limiter (defaults + one sign-in rule, client-IP header configured); one active CSV import per supplier (database rule). The AI limits of S3/S4 are decided on D16 (one small usage table).

### Packages
Pin exact versions (the drafts' `package.json` uses `^` ranges).

## 3. Mentor questions
Now named **M1–M5** (M1 payment model = old Q4, M2 = Q3, M3 = Q6, M4 = Q7, M5 = VAT/PIB), phrased as confirmations — see `MENTOR-QUESTIONS.md`.
