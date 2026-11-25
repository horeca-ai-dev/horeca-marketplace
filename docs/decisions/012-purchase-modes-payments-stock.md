# 012 — Purchase modes, contracts, card payments, supplier stock, onboarding, language

Date 25.11.2026 · Authors @BogdanD3 with Claude, reviewed by an independent review (Fable, decision-12 round) · **Status: accepted** · *Amended 25.11.2026: five gaps found while applying it to the docs are resolved in §4, §6, §7, §12, §13 (worker grant for `supplier_submission`, refund rows from the worker, no `sale_reversal` for direct, supplier-API env, gateway-API task).*

## Context
On 25.11 the mentors decided how purchasing works and answered our open questions. These decisions **replace** parts of the plan (they are the agreed way of doing the original features). The review reproduced four flows that would have failed under the current roles and policies; their fixes are part of this decision. **Where this file disagrees with `docs/decisions-9-11/` or with older text in README / CLAUDE / DESIGN / TASKS, this file wins.**

## 1. Mentor answers
| Topic | Decision |
|---|---|
| Payment model (M1) | Three purchase modes (§2) |
| Shipping waits for payment (M2) | Yes, for platform-paid sub-orders |
| Buyer suspension (M3) | Not in the MVP |
| VAT on commission, invoice content (M4) | Not critical; simple layout, editable later |
| VAT 21 / 15 / 7 / 0 %, tax ID 8 or 13 digits (M5) | Confirmed |
| Suppliers | A list of collaborating companies, **onboarded by the platform admin**; public registration for **buyers only** |
| Product data | Scraped from Montenegrin suppliers (§9) |
| Images / storage | WebP in 3 sizes with `srcset`; Docker volume on the server, nightly backups (unchanged) |
| Stock | Only via supplier API (mocked); CSV only for product data |
| Claude API key | Only when testing the AI stretch features |
| Language | Montenegrin (§10) |
| UI | Responsive, distinctive, clearly better than a generic design (§10) |
| Licence / Playwright for PDF | None for now / approved |

## 2. Three purchase modes — chosen per supplier group in the cart (per sub-order)
| Mode | Available when | Invoicing and payment | Commission |
|---|---|---|---|
| **direct** (existing contract) | Active contract with that supplier | Buyer and supplier invoice and pay each other outside the platform | Charged to the supplier per sub-order at order placement (reversed on cancellation); the admin records the supplier's commission payment |
| **platform** (card) | Always | Buyer pays the platform by card (mock gateway); the platform issues the pro-forma for the platform part and pays the supplier later | Kept from the payout (gross − commission) |
| **request a contract** | No active contract | Not a purchase: request → supplier accepts / rejects → active contract enables direct. Meanwhile platform mode is available | — |

One checkout can mix modes. Cart per supplier group: contract active → "Order directly under our contract" or "Pay by card"; no contract → "Pay by card" + "Request a contract"; contract requested → "Pay by card".
**Netting:** a supplier selling in both modes has its direct-mode commission netted against platform payouts (to confirm with the mentors).

## 3. Contracts
- Table `supplier_agreements`: `id`, `buyer_org_id`, `supplier_org_id`, `status` (`requested` → `active` | `rejected`; `active` → `ended`), `payment_term_days` (optional, informational), `buyer_note`, `supplier_note`, `requested_by_user_id`, `decided_by_user_id`, `requested_at`, `decided_at`, `ended_at`. No `kind` column (it changed no behaviour).
- Partial unique index: at most one `requested` or `active` row per (buyer, supplier).
- The buyer inserts only `requested`; updates are limited by a column grant to the status / decision fields; the supplier always confirms.
- Policies: `agreement.request` (buyer members), `agreement.accept` / `.reject` (supplier members), `agreement.end` (owner of either side), `agreement.view` (both sides; platform read). RLS: own `buyer_org_id` or `supplier_org_id`.
- E-mails: request → supplier; decision → buyer.
- Not the same as stretch S5 (request for quote).

## 4. Orders, money, ledger
- `sub_orders.mode`: `direct` | `platform`; `direct` only if the contract is `active` when the checkout transaction runs (revalidated inside it). Optional second layer: `sub_orders_insert` requires an active agreement for `direct`.
- `orders.payment_method` is removed (mode per sub-order; card for the platform part).
- **Keep `order_payments` and `app.recompute_order()`** (and their tests). The worker inserts a `receipt` on `payment.succeeded` and a `refund` on `refund.succeeded` — so `order_payments_worker_insert` allows `type IN ('receipt', 'refund')` (still with `payment_id` set and no `recorded_by_user_id`). One change in `recompute_order`: the amount due counts **platform** sub-orders only; an order with none gets `not_applicable` (new value of `orders.payment_status`). Only the manual "record buyer payment" admin screen is removed.
- **Commission per sub-order for both modes** (unchanged formula).
- **`sub_orders.supplier_submission`** is written by the worker: `GRANT UPDATE (supplier_submission) ON sub_orders TO horeca_worker` and a worker UPDATE policy limited to that column (the column grant is what limits it; the policy only lets the row be updated).
- **Ledger** (+ = platform owes the supplier more):
  | Event | platform | direct |
  |---|---|---|
  | Checkout | `sale` +gross, `commission` −commission | `commission` −commission only |
  | Cancellation | `sale_reversal` −gross, `commission_reversal` +commission | `commission_reversal` +commission |
  | Supplier pays commission | — | **new** `commission_payment` +amount (admin records it) |
  | Payout / adjustment | as before | adjustment only |
- Schema rules: `ledger_entries_sign` gets `commission_payment > 0`; `ledger_insert_platform` allows `payout`, `adjustment`, `commission_payment`; `ledger_insert_checkout` refuses `sale` for a direct sub-order; `ledger_insert_reversal` refuses `sale_reversal` for a direct sub-order.
- Invariants: platform `payable + commission = gross`; direct sub-order entries sum to −commission; cancelled sub-orders sum to 0; a supplier balance may be negative.
- **M2:** `subOrder.ship` requires `paid` for platform sub-orders (optional second layer: the supplier update policy refuses `shipped` unless direct or paid). Confirming before payment is allowed.
- **Cancellation by the system:** one `SECURITY DEFINER` function `app.system_cancel_sub_order(id, reason)`, executable **by `horeca_worker` only**: sets `cancelled` with the reason, writes the event, books the reversals, recomputes the order. Used by payment expiry and by a supplier-API rejection. Tested.
- **Buyer cancellation** of a platform sub-order is blocked while a payment is `pending`.
- **Refunds:** only as the result of cancelling a **paid** platform sub-order before shipping — for that sub-order's gross. Reversals are booked at cancellation (as today); the refund callback only records the `refund` row. `payments.refunded_cents` added. No separate admin refund action in the MVP.
- **Expiry:** an unpaid platform part expires after 30 minutes; before cancelling, the job asks the gateway for the payment status (a late callback must not lose a paid order).

## 5. Pro-forma invoice
Created **once at checkout** for the **platform part** of the order (totals = the platform sub-orders, not the order totals), never changed afterwards; "paid" is shown on the order page. Orders without a platform part get none. The brief's "payment by pro-forma invoice (generated PDF)" is shown with a card-paid order (to confirm with the mentors).

## 6. Mock card gateway (replaces stretch S6; MVP)
- Lives in the **`mock-services`** app (§8), reached at `/gateway/` on our domains. Card data is entered only on its hosted page — never in our app, database or logs.
- **Flow:** after the checkout transaction commits, the web request calls `PaymentProvider.createPayment` (API key, idempotency key, amount, EUR, references, return + callback URLs; 2–3 s timeout; if it fails, the order page offers "Pay now") → `payments` row `created → pending` → buyer redirected to the hosted page → gateway redirects back **and** sends a **signed callback**.
- **Callback route handler (web):** verify the HMAC-SHA256 signature on the raw body (constant time, timestamp tolerance) → enqueue **one job** with the event → answer 200. If our `payments` row does not exist yet, answer non-2xx (the gateway retries).
- **Worker (system login) processes the event:** insert `payment_events` (duplicate event ID → no-op), check amount and currency, update `payments`, insert the `order_payments` receipt / refund, call `app.recompute_order()`, then submit platform sub-orders to the supplier API (§7) and enqueue e-mails.
- **States:** `created → pending → succeeded | failed | cancelled | expired`; refunds tracked by `refunded_cents`. Several attempts per order allowed, at most one `succeeded`. Sale = authorise + capture in one step.
- **Gateway API:** `POST /payments`, `GET /payments/{id}` (status query, used by expiry), refunds; signed callbacks (HMAC-SHA256) retried on failure; admin "replay last callback" (basic auth). Built in task D10-B3 inside `mock-services`; the hosted card page is D10-A3.
- **Before G3:** test cards **success** and **declined**, one callback retry, the admin **"replay last callback"** button (idempotency demo), forged signature rejected. **After G3:** 3-D Secure step, insufficient funds, processing error / timeout.
- **Safety:** fixed banner "TEST — do not enter a real card"; only documented test numbers accepted; numbers never logged or stored; the gateway admin page behind basic auth in every environment.
- Tables `payments`, `payment_events` move from stretch into the MVP. Env: `PAYMENT_GATEWAY_URL`, `PAYMENT_GATEWAY_API_KEY`, `PAYMENT_WEBHOOK_SECRET`; for the stock API (§7) `SUPPLIER_API_URL`, `SUPPLIER_API_KEY`.

## 7. Supplier stock API (mock)
- Lives in **`mock-services`**: `GET /suppliers/{id}/stock?skus=…`, `POST /suppliers/{id}/orders` (idempotent by sub-order ID; decrements stock, may reject lines). Behaviours per supplier: **normal · down (503) · some SKUs out of stock**. In-memory state seeded on start from the same data as the catalogue.
- Our app calls it with `SUPPLIER_API_URL` + `SUPPLIER_API_KEY` (one mock for all suppliers; the supplier ID is in the path).
- Cache `product_stock` (`product_id`, `available_qty`, `status` ok | unknown, `fetched_at`; read policy for logged-in users; written by the worker), refreshed by a scheduled pg-boss job every 5 min, shown as a **badge** (no filter in the MVP).
- **Checkout:** a fresh stock check per supplier in the request **before** the transaction (2–3 s timeout); inside the transaction only our own data is revalidated. API down → that supplier group shows "availability unknown" and cannot be ordered; the other groups can.
- **Submission:** `sub_orders.supplier_submission` (`pending`, `accepted`, `rejected`, `failed`). Direct mode: submitted after commit. Platform mode: submitted after `payment.succeeded` (an unpaid order holds no stock). Any rejected line → `app.system_cancel_sub_order` + e-mails (and an automatic refund if paid). Retries exhausted → `failed`, nothing cancelled automatically (admin sees it).
- CSV import stays for product data; stock is never imported from files.

## 8. `mock-services` and supplier onboarding
- **One `mock-services` app** (gateway + supplier stock API) built as a **fourth entry point of the existing image**, its own container per environment, state in memory with a seed on start. Built by Member A; Member B integrates against it.
- **Supplier onboarding by the admin:** organization + profile (`approved`) + owner user created through a Better Auth server API **that does not start a session** (test that the admin stays logged in as the admin); a set-password link with a longer lifetime is sent to Mailpit **and shown once to the admin**, who hands it to the supplier.
- Policy / guard edits: `org_profiles_insert` and `supplier_profiles_insert` allow the platform; `app.org_profiles_guard()`: supplier profiles are inserted **by the platform only, as `approved`**. Public registration can no longer create a supplier. Tests about pending suppliers and re-apply are updated.
- Removed: supplier self-registration, approval queue, pending banner, approve / reject / re-apply flows. "Complete company setup" stays for buyers.

## 9. Scraped product data
- Standalone script `tools/scraper/` (not in the app image): two real sources, about **40 products each**, third supplier generated; **time-box 4 h**, then generated data. Respects `robots.txt`, rate-limited.
- Output in **`.seed-private/`**, excluded in **`.gitignore` and `.dockerignore`**; copied to the server by hand and backed up. Seed uses it if present, otherwise generated data.
- **Production shows fictional supplier names and closed registration** unless the mentors confirm the companies agreed (to confirm). Scraped data, images and real names are never committed.

## 10. Language and design
- **Montenegrin (Latin)** for the UI, e-mails, invoice PDF, validation and domain error messages, CSV reports — via `next-intl` from the start (D3-A4 is MVP again). Code, logs, README, specification in English. English UI only if time allows. Presentation language: to confirm.
- **Design bar:** a distinctive visual direction written into `DESIGN.md` **before the first screens** (typography, colour, layout rhythm, motion), then applied to every screen. This is real time on every screen, budgeted in §12.

## 11. Rules changed elsewhere
- **CLAUDE.md rule 11:** no external call **inside a transaction**; in a web request only the stock check and `createPayment` are allowed, each with a 2–3 s timeout.
- **CLAUDE.md rule 5:** add the payment callback route handler (verify + enqueue only) and the gateway paths.
- **CLAUDE.md / glossary:** pro-forma = platform part of an order, created once at checkout.
- **DESIGN.md / README.md:** Montenegrin; buyer-only registration; three modes; stock badge; gateway banner.

## 12. Migrations
**D4 (order core):** `sub_orders.mode`, `sub_orders.supplier_submission` (+ worker column grant and update policy), `orders.payment_status` + `not_applicable`, `orders.payment_method` removed, `ledger_entries` (`commission_payment` + sign rule + policy edits incl. no `sale_reversal` for direct), invoice totals = platform part, `recompute_order` change, identity policy / guard edits (§8), tests updated.
**D5 (second migration):** `supplier_agreements` (+ policies, column grant, tests), `payments` + `refunded_cents`, `payment_events`, `order_payments_worker_insert` for `receipt` and `refund`, `product_stock` (+ read policy, worker write), `app.system_cancel_sub_order()` (+ tests). **ERD freeze: D5 evening.**
Stretch tables still later: `price_tiers`, `buyer_prices`, `rfq_*`.

## 13. Plan changes (`TASKS.md`)
| Task | Change |
|---|---|
| D2-B2 | Registration for **buyers only** |
| D3-A4 | i18n is MVP: Montenegrin messages (no longer optional) |
| D4-A0 (new, A 2h) | Design direction in DESIGN.md before the first screens |
| D4-B1, D4-B2 | Order-core migration and policy / guard edits per §12 |
| D5-B0 (new, B 3h) | Second migration per §12; ERD freeze |
| D5-B1 | Replaced: admin "Create supplier" (Better Auth server API without session, set-password link) |
| D5-A3 | Replaced: admin "Create supplier" form + supplier list (no approval queue, no pending banner) |
| D6-A3 (new, A 3h) | `mock-services` app (4th entry point, container) with the stock API |
| D7-B3 | Replaced (was cache Redis): stock sync job + `product_stock` + badge in the index |
| D7-A1 | + stock badge |
| D8-B3 | Replaced: scraper (time-box 4 h) + private seed |
| D8-B4 (new, B 4h) | Contracts: domain, policies, e-mails |
| D8-A1 | + per-supplier mode choice in the cart |
| D9-B1 | Checkout with modes, pre-transaction stock check, direct-mode commission, submission job for direct |
| D9-A1 | Checkout per mode + redirect to the gateway |
| D9-A3 / D10-A2 (new, A ≈ 5h) | Contract UI: request (supplier group / supplier page), supplier inbox, buyer "My contracts" |
| D10-A3 (new, A 3h) | Gateway hosted page (test banner, success / declined) + return / status page |
| D10-B3 (new, B 3h) | Gateway API in `mock-services`: `POST /payments`, `GET /payments/{id}`, signed callback (HMAC-SHA256) with retry, admin "replay last callback" (basic auth), test cards success / declined |
| D11-B2 | Replaced: payment integration — createPayment, callback route → job, worker processing, expiry via status query, submission after payment |
| D11-B1 | + commission_payment recording (direct) next to payouts |
| D12-B1 | Ship requires paid (platform); expiry and rejection via `app.system_cancel_sub_order` |
| D12-B3 | Seeded orders in both modes |
| D13-B1 | Invoice for the platform part only |
| D13-A2 | "Record buyer payment" panel replaced by "record commission payment" (direct) |
| D15–D16 | Gateway completion: declined card E2E, forged + replayed callback, expiry, supplier API down; then 3-D Secure and the other test cards |
| Stretch | S6 removed (now MVP); order **S3 → S4 → S1 → S5**, realistically **1–2** of them from D17; S2 / S7 only if time |
| Demo script | Rewritten: direct order under a contract, card payment (success + declined), forged callback rejected, replayed callback ignored, supplier API down blocks one group only |

**Gates:** G1 = D4 order core + D5 second migration (ERD freeze D5). **G2** = happy path with a **direct** order under an active contract, stock badges visible. **G3** = the brief's Definition of Done + one **successful card payment** with its pro-forma; failure scenes on D15–D16.
**Time:** net ≈ +55–70 h (independent review); covered by the stretch window, which now holds 1–2 stretch goals.

## 14. To confirm with the mentors (defaults apply unless they object)
1. The brief's pro-forma is shown with a card-paid order; bank transfer is replaced by direct mode; Definition of Done otherwise unchanged.
2. We plan 1–2 stretch goals (S3 first). Which matters most?
3. Have the scraped suppliers agreed to appear publicly? Default: fictional names, closed registration on production.
4. Direct-mode commission is netted against platform payouts.
5. Direct-mode commission is charged at order placement, reversed on cancellation.
6. Refunds only by cancelling a paid sub-order before shipping.
7. The admin hands the set-password link to a new supplier (e-mail stays in Mailpit).
8. Presentation language?

## Alternatives rejected
Mode per whole order (forces buyers to split carts) · dropping `order_payments` (throws away tested logic) · callback processing in the web container (no actor context) · two separate mock services (3–4 h more infrastructure) · full gateway depth before G3 (time) · Postgres search instead of Meilisearch (unchanged choice).
