# Decisions 9, 10, 11 — permissions & RLS, catalogue, orders & money

**Decided by:** Member B, Tue 24.11.2026, with a Claude session (options + trade-offs + recommendation for every
sub-decision; Member B confirmed each). **Status:** proposed — for Member A's review, then into the specification (D3-B1).
**Follows:** `HANDOFF-DECISIONS-9-11.md`. Decisions 1–8 were not reopened; problems found in them are in
`REVIEW-FINDINGS.md` (not applied). Nothing in the planning zip was edited.

## Contents of this zip
| File | What |
|---|---|
| `DECISIONS-9-11.md` | this file — every sub-decision (chosen · rejected · why), how the schema follows from them, table catalogue, open questions |
| `REVIEW-FINDINGS.md` | 16 findings in the planning zip with proposed changes (3 must-fix before G1) |
| `permission-matrix.md` | final matrix, named policy list, responses, table coverage, rate limits |
| `money-rules.md` | units, rounding, formulas, ledger, derived statuses, 10 worked examples |
| `money-vectors.json` | the worked examples as unit-test vectors for `money.ts` *(extra)* |
| `schema/*.ts` | Drizzle schema drafts: `identity-ext`, `catalogue`, `orders`, `finance`, `stretch` (+ `_shared` helpers and a Better Auth **placeholder**, see Verification) |
| `schema/rls.sql` | roles, context, RLS policies, guard triggers, SECURITY DEFINER helpers (MVP + stretch section) |
| `diagrams/*.mmd` + `.png` | `erd-catalogue`, `erd-orders`, `state-suborder`, `checkout-sequence` (+ `erd-stretch`) |
| `seed-categories.md` | category tree, attribute definitions with units, demo CSVs, deliberate bad rows |
| `tests/`, `tools/`, `run_db_tests.sh`, `drizzle/` | *(extras)* RLS tests, money reference implementation, generated SQL — how everything below was verified |

## Summary — the ten choices that shape the schema
| # | Choice | Main consequence in the schema |
|---|---|---|
| 1 | **Buyers pay the platform; the platform owes each supplier `gross − commission`** (as in the project brief) | `ledger_entries` per supplier; `order_payments`; one pro-forma per order with the platform as issuer |
| 2 | **Ledger written at checkout, reversed on cancellation** (fits TASKS D11 → D12 and the demo) | `sale` / `commission` / `*_reversal` entry types, unique per sub-order, amounts checked by RLS |
| 3 | **One pro-forma per order, versioned** — never regenerate a file | `proforma_invoices(order_id, version)`, gapless `invoice_counters` |
| 4 | **Half-up rounding, VAT per line, commission once per sub-order on net**, rates in basis points | `*_cents bigint`, `*_bps integer`, line/sub-order/order totals with CHECKs |
| 5 | **Supplier-owned listings** + optional GTIN/MPN | `products` belongs to one supplier; `gtin` index for "compare offers" |
| 6 | **Typed attribute definitions inherited down an `ltree` tree; values in JSONB** | `categories.path ltree`, `category_attributes`, `products.attributes jsonb` |
| 7 | **CSV: one leaf category per file, validate → confirm, upsert by (supplier, SKU)** | `csv_imports` with status machine and report |
| 8 | **RLS as second line, with three DB roles** (owner / app / worker) | `rls.sql`; `DATABASE_WORKER_URL` |
| 9 | **Denormalised `buyer_org_id` / `supplier_org_id`** on every order-side table | every RLS policy is a one-column comparison; suppliers never read `orders` |
| 10 | **Foreign → 404, own-but-role → 403, own-but-status → 409** | typed domain errors map 1:1 |

---

## Decision 9 — Permission matrix and RLS

### 9.1 Matrix
**Chosen:** the planning-session matrix, with its recommendations (suppliers browse the catalogue; admins archive
but never edit supplier products; ledger and IBAN owner-only; no owner/member difference in the platform org
except member management), plus four changes forced by decision 11 (✏️ in `permission-matrix.md`):
1. **Pro-forma download: suppliers — no access.** One pro-forma per order lists other suppliers' lines and prices (REVIEW F5).
2. **New platform actions:** record buyer payment / refund; record supplier payout / adjustment. Buyers see the payment status; suppliers see "order paid?" on their sub-order.
3. **Tax ID (PIB) immutable** for non-platform actors (guard trigger); IBAN and legal-data changes are audited.
4. CSV imports: platform may **read** them (support). Re-issued pro-forma versions are created by a job, not a user action.

**Rejected:** a separate permission model for the platform org (owner vs member) — no use case in the MVP.

### 9.2 Named policies
**Chosen:** `domain.verb` names (`product.update`, `subOrder.ship`, `payment.recordReceipt` …), each with allowed
org type × role, ownership rule and status preconditions — the full list is `permission-matrix.md §2` and becomes
`policy.ts` + the matrix-driven test harness (D3-B4). Evaluation order inside every domain function:
**load through a scoped query → missing = `NotFound` → `policy.can()` (org type, role) → status check → act.**
**Rejected:** role-only checks in middleware/layouts (CLAUDE.md rule 6 forbids them as the only layer).

### 9.3 Not found vs forbidden vs conflict
**Chosen:** foreign resource or foreign area → **404**; own organization's resource but the role may not do it → **403**;
own resource in the wrong status → **409** with a message. **Rejected:** "everything denied is 404" (the planning
legend): it answers "does not exist" for things the member sees on screen, which confuses users and support;
a 403 inside the own organization leaks nothing. CLAUDE.md's "never 403" is about foreign tenants and still holds.

### 9.4 RLS context and database roles
**Chosen:**
- `withTx(actor)` starts every transaction with `set_config('app.user_id' | 'app.org_id' | 'app.org_type' | 'app.role', …, true)` — transaction-local, so a pooled connection never carries a previous request's actor. No context → helpers return NULL → **zero rows (fail closed)**.
- **Three roles:** `horeca_owner` (owns tables, migrations), `horeca_app` (web; not owner, `NOBYPASSRLS`), `horeca_worker` (worker only).
- **System context = the `horeca_worker` role**, reached only through `DATABASE_WORKER_URL`, which only the worker container has. A web request physically cannot get system access.
- Jobs that act **for a user** (CSV import) run as `horeca_app` with `withTx(actor)`, the actor captured at enqueue time and re-checked against `member`. Pure system jobs (search sync, PDF, e-mail, thumbnails, invoice re-issue) use `withSystemTx()` = `horeca_worker`.
- Not `FORCE ROW LEVEL SECURITY`: the owner and three reviewed `SECURITY DEFINER` helpers must bypass RLS by design.

**Rejected:** a session variable `app.system = on` set by `withSystemTx()` — any code in the web process could call it;
a `BYPASSRLS` app role — removes the second layer entirely.

### 9.5 Policies per kind of table
| Kind | Rule | Tables |
|---|---|---|
| Supplier-owned | `supplier_org_id = app.org_id()`; writes blocked while the supplier is suspended | products, product_images, csv_imports, supplier_profiles (owner role) |
| Buyer-owned | `buyer_org_id = app.org_id()` | carts, cart_items, buyer_locations, orders, proforma_invoices, order_payments (read) |
| Shared order data | buyer of the order **or** supplier of the sub-order | sub_orders, order_lines, sub_order_events |
| Catalogue read | any logged-in org: `status = 'active'` and supplier `approved`; own rows always; platform all | products (+ images through the product) |
| Platform | reads all; writes only where the matrix allows | all |
| Append-only | INSERT policy only + no UPDATE/DELETE privilege | ledger_entries, order_payments, audit_log, sub_order_events, order_lines |
| Checkout writes on behalf of others | buyer may insert `sale`/`commission` only for **its own pending** sub-orders and only with the exact amounts | ledger_entries |
| No direct access | no policy; only `app.next_invoice_number()` | invoice_counters |
| **No RLS** | managed by Better Auth; protected by the app | user, session, account, verification, organization, member, invitation |

Reference data (categories, attribute definitions, settings) **has** RLS: read for any logged-in org, write for the
platform. The checkout (buyer context) must read the default commission → `settings` readable; supplier overrides are
resolved by `app.resolve_commission_bps()` because buyers cannot read `supplier_profiles`.
Old-vs-new rules RLS cannot express (type immutable, tax ID and status platform-only, commission override
platform-only, supplier "rejected → pending" re-apply) are **guard triggers** that apply only to `horeca_app`.

**Denormalisation (chosen):** `buyer_org_id` and `supplier_org_id` are copied onto `sub_orders`, `order_lines`,
`sub_order_events`, `product_images`, `cart_items`; delivery and buyer snapshots are copied onto `sub_orders`.
Every policy is then one indexed comparison, no policy joins three tables, and a supplier never needs the
`orders` row (which shows the other suppliers' totals). Consistency of the copies is enforced by the insert policies
(`EXISTS` on the parent with the same org IDs). **Rejected:** policies with sub-queries through `orders` (slow, easy to get wrong, would expose `orders` to suppliers).

### 9.6 Audit log
**Columns:** `actor_user_id` (NULL = system), `actor_org_id`, `actor_org_type`, `action` (policy name), `entity_type`,
`entity_id`, `before`, `after` (JSONB), `request_id`, `created_at`. Written in the same transaction as the change;
insert-only; readable by the platform only. **Audited actions:** supplier approve / reject / suspend / reinstate / re-apply,
commission default and override, other settings, admin cancellation, admin archiving, categories and attribute
definitions, buyer payments and refunds, payouts and adjustments, IBAN and legal-data changes, member invite/remove (S7).

### 9.7 Rate limits
Sign-in 5/min per IP+e-mail, reset 3/h per e-mail, registration 5/h per IP (Better Auth built-in — verify config);
CSV upload 10/h per supplier + one active import; image presign 60/h; checkout 10/min per buyer org; S3 AI 30/h per
supplier + daily cost cap; S4 20/min per user. Counters on the cache Redis (an evicted counter just resets).

---

## Decision 10 — Catalogue model

### 10.1 Category tree
**Chosen:** `parent_id` (FK integrity, children queries) **plus** `path ltree` (subtree filters with GiST), max depth 3,
`position` among siblings, **products only on leaf categories**, rename allowed but **no moving in the MVP**.
**Rejected:** adjacency list + recursive CTE only (every subtree filter becomes recursive); unlimited depth; moving
categories (path rewrite + Meilisearch reindex of a subtree — not worth it in 21 days).

### 10.2 Attribute definitions
**Chosen:** columns `key, label, type (number|enum|boolean|text), unit, required, filterable, sortable, options, min/max, position, is_active`.
Children **inherit** all ancestor definitions **without overrides**; a key is unique along the path (service check).
Changes are **additive only**: new optional definitions any time, new required ones only if the subtree has no products,
enum options add-only, no type change, **deactivate instead of delete** (values kept, hidden from forms/filters).
**Rejected:** child overrides (Zod generation and explanation get much harder); EAV tables (slow filters, hard to
validate); a table per category (migrations for every new category).

### 10.3 Attribute values
**Chosen:** `products.attributes jsonb`, validated by a Zod schema generated from the effective definitions with
`.strict()` (unknown keys rejected); numbers as JSON numbers, enums as their `value`. **Canonical units** per definition
(W, mm, l, kg, °C, cm, pcs); the key carries the unit (`capacity_l`). **No unit conversion in the MVP** — CSV and form accept
the canonical unit only (header names it); messy input is S3's job. **Rejected:** conversion on import (ambiguous input, extra tests).

### 10.4 Product ownership
**Chosen:** supplier-owned listings with optional **GTIN/EAN** and **MPN**. S2 compares products of the same category;
"compare offers" finds the same GTIN at other suppliers. **Rejected:** shared master catalogue + offers — someone must
curate the master data and merge duplicates; too big for the team and timeline.

### 10.5 Product columns
**Chosen:** see `schema/catalogue.ts`. Notable: `unit` enum, `min_order_qty` + `order_step` (`qty ≥ min` and `qty % step = 0`;
`min % step = 0` is a CHECK), `base_price_cents bigint` net, `vat_rate_bps`, `status draft|active|archived`,
**no stock** in the MVP, **archive only** (no soft delete, no hard delete — order lines keep a reference).
**Rejected:** boolean in-stock (sync + filter for little value); stock quantity (reservations in checkout).

### 10.6 Images
**Chosen:** `product_images` with `position` (0 = main, ≤ 8), `alt`, `original_key`, `thumb_key` (set by the job),
`content_type` (JPEG/PNG/WebP by magic bytes), `size_bytes ≤ 5 MB`, `width/height`, `status pending|ready|failed`.
Flow: presigned PUT → "confirm upload" action inserts the row → thumbnail job (sharp, one 480 px WebP).

### 10.7 CSV import
**Chosen:** **one leaf category per file** (its template = fixed columns + its attribute keys with units), two phases
**validate → report → "Import N valid rows"** (valid rows imported, invalid ones downloadable as an error CSV), upsert by
`(supplier, SKU)`, ≤ 5,000 rows / 5 MB, UTF-8 (BOM ok), `;`/`,` auto-detected, decimal comma or dot, optional `status`
(default `draft`), **no image URLs** (SSRF), one active import per supplier (partial unique index). On confirm the stored file
is re-parsed and re-validated (definitions may have changed) — no staging table. Runs as a job with `withTx(actor)`.
**Rejected:** one file for all categories (huge template, confusing errors); all-or-nothing import (re-upload covers it); staging table for parsed rows.

### 10.8 Meilisearch document
**Chosen:** `id, supplier_org_id, supplier_name, category_id, category_ancestor_ids[], category_names, name, brand, sku, gtin,
mpn, description (truncated), price_cents (base net), unit, attr_<key>…`. Searchable: name, brand, SKU, GTIN, MPN,
description, category names. Filterable: `category_ancestor_ids` (subtree filter), supplier, price, `attr_*` with
`filterable`. Sortable: price, name, date, `attr_*` with `sortable`. Facets: supplier + filterable enum/boolean attributes.
Typo tolerance on, **off for SKU/GTIN**; diacritics folding ("frizider" → "frižider") is Meilisearch default — **verify in docs**.
Sync jobs (after commit) on: product change/archive, supplier status change (index or remove all its products),
category rename (subtree), attribute `filterable`/`sortable` change (index settings). **Only the base price is indexed** —
S1 buyer prices are not filterable/sortable; they are shown after the Postgres re-fetch.

### 10.9 Postgres indexes
`products (supplier, status, updated_at desc)` for "My products"; `(category_id)`; unique `(supplier, sku)`; `(gtin)`;
trigram GIN on `name` (fallback search only); `categories` GiST on `path`, `(parent_id, position)`; unique
`(category_id, key)`; unique `(product_id, position)`; `csv_imports (supplier, created_at desc)`.
No GIN on `attributes` — filtering happens in Meilisearch.

### 10.10 Seed
Six roots (kitchen equipment, refrigeration, tableware, textiles, hygiene & cosmetics, bar), 17 leaves, one
depth-3 branch, 46 attribute definitions with canonical units, three supplier CSV sets and one file with eight
deliberate errors → `seed-categories.md`.

---

## Decision 11 — Order & money model

### 11.1 Cart
**Chosen:** **one cart per buyer organization, shared by its members**; a product appears once (`UNIQUE (cart_id, product_id)`);
each line stores `added_by_user_id` and `unit_price_cents_seen` (what the buyer saw — basis for "price changed").
**Rejected:** a cart per user inside the org (contradicts "cart belongs to the buyer organization").

### 11.2 Structure and numbering
**Chosen:** `orders` → `sub_orders` (one per supplier) → `order_lines` (snapshots); names follow the glossary ("sub-order").
Order number `ORD-2026-000123` from a **plain sequence (gaps allowed)**; sub-order number `ORD-2026-000123-1`, `-2` …;
**only invoices are gapless.** **Rejected:** gapless order numbers (extra lock for no legal reason); `supplier_orders` naming.

### 11.3 Money rules
**Chosen:** cents in `bigint`, rates in **basis points**, **half-up**, VAT **per line**, totals = sums, commission =
`round(net × bps / 10000)` **once per sub-order on the net**, rate resolved override → default and **snapshotted**.
Full rules and 10 worked examples: `money-rules.md`. **Rejected:** half-even (unusual on invoices); rounding VAT on
totals (contradicts CLAUDE.md rule 7; see example E3); commission per line (more rounding, no benefit).
VAT rates (21 % / 7 % / 0 %) and invoice content: **verify** with an accountant.

### 11.4 What the supplier is owed
**Chosen:** `payable = sub-order gross − commission`. The buyer pays gross to the platform; VAT belongs to the supplier
(the seller who reports it), so the platform passes it on. **Rejected:** `net − commission` (CLAUDE.md's current
invariant) — the platform would keep VAT that is not its money (REVIEW F2). VAT on the commission: out of scope.

### 11.5 Ledger
**Chosen:** entries at **checkout** (`sale +gross`, `commission −commission`) and on **cancellation**
(`sale_reversal −gross`, `commission_reversal +commission`), plus platform-only `payout` and `adjustment`.
Sign: + = platform owes the supplier. Each sub-order-linked type at most once (partial unique index); amounts are
checked against the sub-order by the RLS insert policies; append-only by privileges. Balance split for the UI:
**pending** (not yet delivered) vs **earned** (delivered) vs **ready for payout** (delivered and paid).
**Rejected:** writing entries only on delivery (no reversals needed, but it breaks TASKS D11 → D12 and the demo's
"cancellation → ledger reversal").

### 11.6 State machine and derived order status
**Chosen:** `pending → confirmed → shipped → delivered`, `pending|confirmed → cancelled`; terminal `delivered`, `cancelled`.
Who: supplier confirms/ships/delivers; cancel by buyer (pending), supplier (before shipped), platform (before shipped, audited).
E-mails: supplier on new sub-order and on buyer cancellation; buyer on every transition. One `transition()` per state machine:
conditional UPDATE (`WHERE status = old`) + `sub_order_events` row + **`app.recompute_order()`** in one transaction.
`orders.status` is stored (admin filters) but written **only** by that SECURITY DEFINER function — the app role has no
UPDATE privilege on `orders`, and a supplier can trigger the recompute only for orders that contain its sub-order.
Rule: all cancelled → `cancelled`; all delivered or cancelled → `completed`; otherwise `in_progress`.
**Rejected:** computing the status on every read (heavier admin lists); letting the supplier UPDATE `orders` (it would need to read the buyer's order).

### 11.7 Pro-forma invoice
**Chosen:** **one per order, issued by the platform**, paid to the platform's IBAN (`settings.platform_company`), suppliers
as sections with their legal data and VAT. Number `PF-2026-000123`, **gapless per year** via `invoice_counters` locked in the
checkout transaction (`app.next_invoice_number()`; a rollback releases the number — tested). v1 is inserted at checkout;
the PDF is rendered **once** by a job from `content_snapshot` and stored. A later cancellation → job inserts **v2**
(`PF-2026-000123/2`) and supersedes v1. Due date from `settings.invoice_due_days`; payment reference and mandatory invoice
content: **verify** Montenegrin requirements; the PDF says "PRO-FORMA — not a fiscal invoice".
**Rejected:** one per sub-order issued by the platform (buyer pays N times); one per sub-order issued by the supplier with
its IBAN (contradicts the ledger model — REVIEW F1); regenerating the stored PDF (DESIGN forbids it).

### 11.8 Checkout transaction (step by step)
1. Server Action: Zod → `resolveActor()` (session + `member` re-check) → `withTx(actor)` sets the RLS context.
2. **Idempotency:** look up `(buyer_org_id, idempotency_key)`. Same `request_hash` → return the existing order; different → `Validation`. Stored permanently on `orders` (unique index scoped to the buyer org — another org re-using a key gets its own order; tested).
3. **Lock:** `cart_items … FOR UPDATE` (two checkouts of one cart serialise); products and supplier `org_profiles … FOR SHARE`.
4. **Revalidate inside the transaction:** product active · supplier approved · qty ≥ min and multiple of step · `PricingResolver` price = `unit_price_cents_seen` · buyer tax ID ≠ supplier tax ID (decision 3).
5. Anything changed → `Conflict { changedLines }`, nothing written; the UI shows the lines and asks to re-confirm.
6. Split per supplier; compute with `money.ts`; rate via `app.resolve_commission_bps()`.
7. INSERT `orders`, `sub_orders`, `order_lines`, `sub_order_events`, `ledger_entries` (no `RETURNING` — buyers cannot read the ledger), invoice number + `proforma_invoices` v1; DELETE cart lines.
8. COMMIT. Any error → rollback: nothing persisted, invoice number not consumed.
9. `afterCommit`: buyer confirmation e-mail, one e-mail per supplier, invoice render job.
Diagram: `diagrams/checkout-sequence.mmd`.

### 11.9 Settings
`settings(key, value jsonb)`: `default_commission_bps`, `platform_company`, `invoice_due_days`, `vat_rates_bps`.
Read by any logged-in org, written by the platform, every change audited.

### 11.10 Payment
**Chosen:** `payment_method proforma | bank_transfer | card` (card = S6). `payment_status unpaid | paid | refund_due` on the
order, **derived** from `order_payments` (receipt/refund recorded by the platform from the bank statement; S6 inserts a
receipt automatically), copied to `sub_orders.order_payment_status` for suppliers. **In the MVP the payment status is
informational — shipping does not wait for payment** (open question Q3). **Rejected for the MVP:** "pro-forma = prepayment,
ship only when paid" — correct business-wise, but adds a state-machine condition and depends on the admin payment screen.

---

## How the schema follows from the decisions
This section walks the schema table by table group and names the decision behind every non-obvious column or constraint.

**Identity extension (decision 3, adjusted by 9 and 11).** Better Auth keeps users, sessions, organizations and members
— generated by its CLI, not designed here. `org_profiles` is the 1:1 company record; `type` is immutable and
`status` is platform-controlled (guard trigger, 9.5); `UNIQUE (tax_id, type)` is decision 3; a CHECK keeps buyers
and the platform `approved` (buyers need no approval). The address is split into `address_line / city / postal_code /
country` because the pro-forma must print it (11.7). `supplier_profiles` holds the IBAN (payouts, 11.4) and
`commission_override_bps` (bps from 11.3, platform-only by trigger, resolved by `app.resolve_commission_bps`).
`buyer_locations` are archived, never deleted, because orders snapshot them (CLAUDE.md rule 8).

**Catalogue (decision 10).** `categories` carries both `parent_id` and `path ltree` (10.1); `depth` with a CHECK enforces
the max depth 3. `category_attributes` is the "typed definition" half of 10.2/10.3 — `options` only for enums, `min/max`
only for numbers (CHECKs), `is_active` instead of delete, key format CHECK because the key becomes a JSONB key, a CSV
header and a Meilisearch field (`attr_<key>`). `products` is supplier-owned (10.4) with `UNIQUE (supplier_org_id, sku)` —
the CSV upsert key (10.7) — and `gtin`/`mpn` for compare offers; money and rate columns follow 11.3; `min_order_qty /
order_step` come from 10.5 and are re-checked at checkout (11.8). `product_images.supplier_org_id` is denormalised for a
simple RLS write policy (9.5). `csv_imports` mirrors the two-phase flow of 10.7; the partial unique index enforces one
running import per supplier.

**Cart and orders (decisions 11.1, 11.2, 11.8).** `carts.buyer_org_id UNIQUE` = one shared cart per org;
`cart_items.unit_price_cents_seen` is what makes "price changed" detectable. `orders` holds what belongs to the whole
checkout: idempotency (`UNIQUE (buyer_org_id, idempotency_key)` — scoped so keys cannot collide across orgs), `source`
and `rfq_quote_id` (S5 seam), `payment_method` (S6 seam), snapshots (rule 8), frozen totals and the two **derived**
statuses. `sub_orders` holds everything a supplier works with: its own copy of the snapshots (so it never reads
`orders`, 9.5), the commission **snapshot** (rate + amount, 11.3), the copy of the payment status, cancel reason
(CHECK: required when cancelled). `order_lines` are pure snapshots; `product_id` is nullable only for RFQ lines and
`price_source` records which price the `PricingResolver` applied (S1 seam); CHECKs pin `net = price × qty` and
`gross = net + vat`. `sub_order_events` is the history of 11.6.

**Money documents (11.7, 11.10).** `proforma_invoices` is per order with a `version`; `content_snapshot` makes the
PDF reproducible without live data; the partial unique index allows exactly one `issued` version per order;
`invoice_counters` + `app.next_invoice_number()` give gapless numbers under concurrency. `order_payments` is the missing
piece the planning docs did not have (REVIEW F3): what the buyer paid and what was refunded; `payment_id` is the S6 seam.

**Finance (11.4, 11.5, 9.6).** `ledger_entries` is the per-supplier account of 11.5: a CHECK pins the sign of each type and
whether a sub-order link is required; a partial unique index makes each sub-order entry type unique; RLS checks the exact
amounts. `settings` and `audit_log` follow 11.9 and 9.6.

**Why the database enforces so much.** Every CHECK, unique index and policy duplicates a rule the domain already enforces.
That is deliberate: two developers in 21 days will have bugs; the database turns a silent money or tenancy bug into a
loud error. All of it was executed and tested (see Verification).

## Table catalogue (quality bar: purpose · owner · RLS · indexes · matrix actions)
| Table | Purpose | Owner | RLS (see rls.sql) | Indexes / constraints | Actions |
|---|---|---|---|---|---|
| `org_profiles` | company record, type, status | all | own; approved suppliers to logged-in; P; guard | PK; UQ (tax_id, type); (type, status) | `org.register`, `orgProfile.*`, `supplier.*` |
| `supplier_profiles` | IBAN, commission override | supplier | owner; P; guard | PK | `supplierProfile.*`, `supplier.setCommissionOverride` |
| `buyer_locations` | delivery addresses | buyer | own buyer; P read | (org); UQ one default | `buyerLocation.*` |
| `categories` | tree | platform | read logged-in; write P | UQ slug, UQ path, GiST path, (parent, position) | `category.*` |
| `category_attributes` | typed definitions | platform | read logged-in; write P | UQ (category, key) | `attribute.*` |
| `products` | supplier listings | supplier | own; visible; P; worker | UQ (supplier, sku); (supplier, status, updated); (category); (gtin); trgm(name) | `product.*`, `catalogue.search` |
| `product_images` | images + thumbnails | supplier | via product; own write; worker update | UQ (product, position) | `productImage.*` |
| `csv_imports` | import runs + report | supplier | own; P read | (supplier, created); UQ one active | `csvImport.*` |
| `carts` | shared cart | buyer | own | UQ buyer_org_id | `cart.*` |
| `cart_items` | cart lines | buyer | own | UQ (cart, product) | `cart.*` |
| `orders` | one checkout | buyer | own; P; worker | UQ number; UQ (buyer, idempotency_key); (buyer, placed); (status, placed) | `checkout.placeOrder`, `order.*` |
| `sub_orders` | per-supplier part | buyer + supplier | buyer / supplier / P | UQ number; UQ (order, supplier); (supplier, status, created); (buyer, created); (order) | `subOrder.*` |
| `order_lines` | line snapshots | buyer + supplier | buyer / supplier / P | UQ (sub_order, position) | `checkout.placeOrder`, `subOrder.view` |
| `sub_order_events` | transition history | buyer + supplier | buyer / supplier / P | (sub_order, created) | `subOrder.*` |
| `proforma_invoices` | invoice versions | buyer | buyer / P; worker | UQ number; UQ (order, version); UQ one issued | `invoice.download` |
| `order_payments` | buyer receipts / refunds | buyer | buyer read; P insert | (order); UQ payment_id | `payment.record*` |
| `ledger_entries` | supplier account | supplier | supplier owner; P; checked inserts | (supplier, created); UQ once per sub-order & type | `ledger.*`, `checkout`, `subOrder.cancel` |
| `settings` | platform settings | platform | read logged-in; write P | PK key | `settings.update` |
| `audit_log` | who did what | platform | insert own; read P | (entity), (created), (actor org) | `auditLog.view` + audited actions |
| `invoice_counters` | gapless counter | platform | none (function only) | PK year | `checkout.placeOrder` |
| stretch: `price_tiers`, `buyer_prices`, `rfq_requests`, `rfq_invitations`, `rfq_quotes`, `payments`, `payment_events` | S1, S5, S6 | see `stretch.ts` header | rls.sql stretch section | see `stretch.ts` | permission-matrix §2 stretch |

## MVP feature coverage (README feature checklist → tables)
| MVP feature (README) | Tables |
|---|---|
| Organizations buyer/supplier/platform · owner/member · several orgs per user | Better Auth `organization`, `member`, `user`, `session` + `org_profiles` |
| Supplier approval · tenant isolation (tested) | `org_profiles.status`, `audit_log` + `rls.sql` (78 tests) |
| Category tree with category-specific attributes · product CRUD · images | `categories`, `category_attributes`, `products`, `product_images` |
| Supplier CSV import with validation report | `csv_imports`, `products.csv_import_id` |
| Catalogue behind login · search + filters | `products` (+ Meilisearch index from it), `org_profiles` (approved), RLS `products_read` |
| Multi-supplier cart · checkout · splitting · sub-order lifecycle | `carts`, `cart_items`, `orders`, `sub_orders`, `order_lines`, `sub_order_events` |
| Commission · per-supplier ledger · pro-forma PDF · admin overview | `settings`, `supplier_profiles`, `sub_orders.commission_*`, `ledger_entries`, `proforma_invoices`, `invoice_counters`, `order_payments` |
| E-mail: order notifications · password reset | jobs (no table); recipients from Better Auth `user` + `member`; reset via Better Auth `verification` |

## Verification — what was run, what was not
**Run (24.11.2026):**
- `tsc --noEmit` (strict) on all schema drafts with **drizzle-orm 0.45.4** — passes.
- `drizzle-kit 0.31` generated the SQL (`drizzle/mvp` = 23 tables incl. the 3 placeholder Better Auth tables; `drizzle/full` = 30); applied to **PostgreSQL 16** together with `rls.sql`.
- `tests/rls_tests.sql`: **78 checks**, incl. a full checkout **as the buyer under RLS**, tenant isolation for every table group, role restriction (supplier member vs owner), status rules (pending, suspended), guard triggers, ledger amount checks, append-only, gapless numbering incl. rollback, worker limits. `tests/rls_stretch_tests.sql`: **8 checks** (S1, S5 "only if invited", S6 dedupe). All pass (`./run_db_tests.sh mvp|full`).
- `tools/money_vectors.py`: all 10 worked examples asserted; output = `money-vectors.json`.
- Mermaid sources rendered with mermaid-cli.

**Reproduce:** `npm install` → `npx tsc --noEmit -p .` → `npx drizzle-kit generate --config drizzle.mvp.config.ts --name mvp`
(and `drizzle.full.config.ts --name full`) → `PG_ADMIN=postgresql://postgres:postgres@localhost:5432/postgres ./run_db_tests.sh mvp`
(and `full`) → `python3 tools/money_vectors.py` → `python3 tools/consistency_check.py`.

**Not verified (do this when implementing):**
- **Better Auth:** the placeholder (`schema/better-auth.placeholder.ts`) must be replaced by the CLI output; check that table names are `user` / `organization` / `member` and IDs are `text` — verify in docs. Its built-in rate limiter configuration — verify.
- **Drizzle migrations for RLS:** `rls.sql` is meant as a custom SQL migration run by the migrate container after the generated one; Drizzle's own `pgPolicy` API was deliberately not used (verify whether you prefer it).
- Meilisearch settings (diacritics, `disableOnAttributes` for SKU/GTIN) — verify in docs. No application code was written or run.
- Montenegrin VAT rates, PIB format, invoice content and payment-reference format — **verify**.

## Open questions
**For Member A**
- Q1. Accept REVIEW F1–F3 (money model, invariant, `order_payments`) into the spec before G1? They change TASKS slightly (admin payment screen ≈ 0.5 d A + 0.5 d B).
- Q2. `DATABASE_WORKER_URL` and three DB roles (F6) — fine for the compose files and D4-B2?
- Q5. Ledger entries in D9-B1 (checkout PR) rather than D11-B1 (F7)?

**For the mentors (Wednesday)**
- Q3. Should shipping wait for payment when the method is pro-forma (prepayment)? MVP answer: no, payment status is informational.
- Q4. Is "the platform collects and pays suppliers" acceptable for the project as a simulation (README already flags the regulatory issue), or do they prefer suppliers to invoice buyers directly?
- Q6. Do they expect buyer suspension (abuse) in the MVP? Currently only suppliers can be suspended.
- Q7. VAT on the platform commission and the exact pro-forma content (Montenegro) — out of scope, OK?
