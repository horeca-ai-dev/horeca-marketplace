# Permission matrix and authorization (Specification §7.3)

*Member B · task D3-AB1 · state: 25.11.2026, after decision 012.*
The **full matrix and the named-policy list** are in
[`docs/decisions-9-11/permission-matrix.md`](../decisions-9-11/permission-matrix.md) (decision 9). That file was
written before decision 012 and is deliberately left unedited, so **this file lists what 012 changed**.
Where the two disagree, this file and [`APPLIED.md`](../decisions-9-11/APPLIED.md) win.

## 1. Model in one page

**Who:** an *actor* = `{ userId, orgId, orgType, role }`. Org type is `buyer`, `supplier` or `platform`; role is
`owner` or `member`. The actor is resolved from the session's active organization **and re-checked against the
`member` table on every request** — never taken from input, URL or body.

**Two lines of defence**
1. **Domain layer (first line):** every domain function loads the resource through a scoped query → missing
   means `NotFound` → `policy.can(actor, action, resource)` → status check → act. Authorization never lives only in
   middleware, layouts or pages. Every Server Action is a public POST endpoint, so each one is checked here.
2. **Postgres RLS (second line):** every transaction sets the actor's organization context
   (`withTx(actor)`); with no context a query returns zero rows (fail closed). Three database logins:
   `horeca_owner` (migrations), `horeca_app` (web, not owner, no `BYPASSRLS`), `horeca_worker` (worker only,
   reachable only through `DATABASE_WORKER_URL`). Policy and guard-trigger details: `rls.sql` + `APPLIED.md` §2, §4.

**Responses** (CLAUDE.md rule 6)
| Situation | Domain error | Result |
|---|---|---|
| Another organization's resource, or another org type's area | `NotFound` | **404** — never reveals it exists |
| Not logged in | — | redirect to login |
| Own organization's resource, but the **role** may not (member doing an owner action) | `Forbidden` | **403** |
| Own resource, wrong **status** (ship a cancelled sub-order) | `Conflict` | **409** + message |
| Invalid input | `Validation` | **422** + field errors |

**Authentication:** Better Auth 1.7.20, e-mail + password, organization plugin **locked down** — users cannot
create or delete organizations; `/organization/*` is an allowlist; `trustedOrigins` = both domains; sign-in rate
limit 5/min per IP (client IP from `X-Real-IP`); `REGISTRATION_OPEN` closes registration. **Public registration
creates buyer organizations only** (012 §8); suppliers are created by the admin ("Create supplier": organization +
profile `approved` + owner user, without starting a session; a set-password link is shown once to the admin).
Better Auth's own tables have no RLS.

## 2. The matrix after decision 012

Legend: ✅ allowed · `own` = own organization's data only · — denied (404, or 403 inside the own org).
Columns: **Bo** buyer owner · **Bm** buyer member · **So** supplier owner · **Sm** supplier member · **P** platform.

### Account and organization
| Action | Bo | Bm | So | Sm | P |
|---|---|---|---|---|---|
| Register a company (public) | ✅ buyer only | — | — | — | — |
| **Create a supplier** (012) | — | — | — | — | ✅ audited |
| Edit company profile (legal data) | own | — | own | — | ✅ |
| Change tax ID (PIB) | — | — | — | — | ✅ audited |
| Supplier bank details (IBAN) | — | — | own, audited | — | read |
| Delivery locations | own | own | — | — | read |
| Switch active organization | ✅ | ✅ | ✅ | ✅ | ✅ |
| Suspend / reinstate a supplier | — | — | — | — | ✅ audited — rules only; **screens are after the project** |
| ~~Approve / reject / re-apply~~ | removed by 012 | | | | |

### Catalogue
| Action | Bo | Bm | So | Sm | P |
|---|---|---|---|---|---|
| Browse catalogue, product detail, **stock badge** | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / edit / archive products, images | — | — | own | own | — |
| CSV import (product data only — never stock) | — | — | own | own | read |
| Archive any product (moderation) | — | — | — | — | ✅ audited |
| Manage categories (attribute definitions come from the seed, no editor in the MVP) | — | — | — | — | ✅ audited |

### Orders, contracts, payments, money
| Action | Bo | Bm | So | Sm | P |
|---|---|---|---|---|---|
| Cart, checkout (mode chosen per supplier group) | own | own | — | — | — |
| View orders | own | own | own sub-orders | own sub-orders | ✅ |
| Confirm / ship / deliver sub-order (**ship needs `paid` for a platform sub-order**) | — | — | own | own | — |
| Cancel sub-order | own, while `pending`, **not while a payment is `pending`** | same | own, before shipped | same | ✅ before shipped, audited |
| Download pro-forma (platform part only) | own | own | **—** | **—** | ✅ |
| See whether the order is paid | own | own | own sub-orders | own sub-orders | ✅ |
| **Pay by card** (mock gateway) | own | own | — | — | read |
| **Request a contract** | own | own | — | — | — |
| **Accept / reject a contract** | — | — | own | own | — |
| **End a contract** | own | — | own | — | — |
| View contracts | own | own | own | own | read |
| Ledger (view) | — | — | own | — | ✅ |
| Record payout / adjustment | — | — | — | — | ✅ audited |
| **Record a supplier's commission payment** (direct mode) | — | — | — | — | ✅ audited |
| Commission settings, per-supplier report | — | — | — | — | ✅ audited |
| Audit log, jobs page | — | — | — | — | ✅ |
| ~~Record buyer payment / refund~~ | removed — the **worker** inserts receipts / refunds from signed gateway events | | | | |

**Status rules:** a suspended supplier's products disappear at once; it can still read and fulfil existing
sub-orders and see its ledger, but cannot edit products or import. A wrong-org-type route → not found.
Platform: no owner / member difference. Stretch rows (S1–S5, S7) stay as in the original matrix.

## 3. Named policies (= `policy.can` actions)

The list in `permission-matrix.md` §2 is the base. **Changes from 012:**

| Change | Policies |
|---|---|
| Removed | `supplier.approve`, `supplier.reject`, `supplier.reapply`, `payment.recordReceipt`, `payment.recordRefund` |
| `org.register` | creates a **buyer** only, status `approved` |
| Added | `supplier.create` (P, audited) · `agreement.request` (B\*) · `agreement.accept` / `.reject` (S\*) · `agreement.end` (Bo, So) · `agreement.view` (B\*, S\*, P read) · `payment.payByCard` (B\*, own order, platform part unpaid) · `ledger.recordCommissionPayment` (P, audited) · `stock.view` (any logged-in) |
| `subOrder.ship` | S\*; `confirmed`; **and** (`mode = direct` or order paid) |
| `subOrder.cancel` | B\*: `pending` **and no pending payment**; S\*: `pending` or `confirmed`; P: before shipped, audited |
| `invoice.download` | B\*, P only (never a supplier) |
| `checkout.placeOrder` | `direct` only under an `active` agreement, revalidated inside the transaction |
| System, not user actions | payment events, stock sync, supplier submission, payment expiry — run by the worker (`horeca_worker`) or `app.system_cancel_sub_order()` |

Each policy gets at least two authorization tests (allowed actor ✓, foreign org of the same type → 404); role
restrictions also get "member → 403". The matrix-driven harness is **D4-B3**; today `policy.can` is a stub with
one action and a deny-by-default `switch` that fails to compile when an action has no branch.

## 4. Table coverage

Every table → owner, RLS summary, actions touching it: **[data-model.md](data-model.md) §6.2** (and
`permission-matrix.md` §3 for the pre-012 version). Worker-only writes: `payments`, `payment_events`,
`product_stock`, `order_payments` (receipt / refund), `sub_orders.supplier_submission`, product-image status,
pro-forma PDF fields.

## 5. Rate limits (no Redis in this design)

| Action | Limit | Where |
|---|---|---|
| Sign-in | 5 / min per IP (client IP from `X-Real-IP`) | Better Auth limiter |
| Password reset, registration | Better Auth defaults | Better Auth limiter |
| CSV import | one active import per supplier | database unique index |
| AI features (stretch S3 / S4) | decided on D16 — one small usage table | — |

The earlier Redis counters (checkout 10/min, image upload 60/h, …) are **dropped**: no Redis, no application cache.

## 6. Audit log

Written in the same transaction as the change; insert-only; readable by the platform only. **Audited:** supplier
creation, commission default / override, other settings, admin cancellation and archiving, categories, payouts and
adjustments, **commission payments**, IBAN and legal-data changes, and — written by the worker with
`actor_user_id IS NULL` — **payment receipts and refunds**.

## 7. Known gaps (said plainly)

- `policy.can` is a stub (one action); the real matrix as code is **D4-B3**. The pre-012 text above is a
  specification, not yet an implementation.
- RLS is not enabled yet — tables from 0001 have grants only; policies land with **D4-B2**.
- The sign-in limit (5/min per IP) is configured and tested; the password-reset and registration limits rely on
  Better Auth's defaults, which are still to be verified against 1.7.20.
