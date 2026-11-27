# Permission matrix and named policies — decision 9

Two layers (CLAUDE.md rule 6):
1. **Domain (first line):** every domain function loads the resource through a query scoped to the actor's
   organization, then calls `policy.can(actor, action, resource)`, then checks the status preconditions.
2. **Postgres RLS (second line):** `schema/rls.sql` — tenant isolation holds even if a query forgets a filter.
   Tested by `tests/rls_tests.sql` (207 checks, incl. section 9 of D5-B0) and `tests/rls_stretch_tests.sql` (S1 and S5).

## Responses (decision 9.3)
| Situation | Domain error | Server Action / route handler |
|---|---|---|
| Resource of another organization, or route of another org type | `NotFound` | 404 / "not found" — never reveals that it exists |
| Not logged in | — | redirect to login |
| Own organization's resource, but the **role** may not do it (member trying an owner action) | `Forbidden` | 403 — the user can already see the resource, so nothing leaks |
| Own resource, action not allowed in its current **status** (ship a cancelled sub-order) | `Conflict` | 409 + message ("This sub-order is cancelled") |
| Invalid input | `Validation` | 422 + `fieldErrors` |

✏️ = changed compared to the matrix proposed in the planning session (reasons in DECISIONS-9-11.md §9.1).

**As code (D4-B3):** §2 is mirrored by `PERMISSIONS` in `src/server/domain/policy.ts`, and
`src/server/domain/policy-matrix.test.ts` parses §2 (this file) and checks every row against `decide()` for the five
kinds of actor × no / own / foreign resource. Edit this document and the table together. Rows kept here but not in
the code: `org.register` (the auth layer's, no organization yet) and `supplier.approve` / `.reject` / `.reapply` and
`payment.recordReceipt` / `.recordRefund` (removed by decision 012). Stretch rows join the table with their features. Status preconditions and field-level
rules stay in the domain services.

## 1. Matrix
Legend: ✅ allowed · `own` = own organization's data only · — denied (404, or 403 within the own org).

**Account & organization**
| Action | Buyer owner | Buyer member | Supplier owner | Supplier member | Platform |
|---|---|---|---|---|---|
| Edit company profile (legal data) | own | — | own | — | ✅ |
| ✏️ Change tax ID (PIB) | — | — | — | — | ✅ (audited) |
| Supplier bank details (IBAN) | — | — | own (audited) | — | read |
| Delivery locations | own | own | — | — | read |
| Switch active organization | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve / reject / suspend / reinstate suppliers | — | — | — | — | ✅ (audited) |
| Re-apply after rejection | — | — | own | — | — |

**Catalogue**
| Action | Buyer owner | Buyer member | Supplier owner | Supplier member | Platform |
|---|---|---|---|---|---|
| Browse catalogue, product detail | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / edit / archive products, images | — | — | own | own | — |
| CSV import | — | — | own | own | ✏️ read (support) |
| Archive any product (moderation) | — | — | — | — | ✅ (audited) |
| Manage categories & attribute definitions | — | — | — | — | ✅ (audited) |

**Orders & money**
| Action | Buyer owner | Buyer member | Supplier owner | Supplier member | Platform |
|---|---|---|---|---|---|
| Cart, checkout | own | own | — | — | — |
| View orders | own | own | own sub-orders | own sub-orders | ✅ |
| Confirm / ship / deliver sub-order | — | — | own | own | — |
| Cancel sub-order | own (while pending) | own (while pending) | own (before shipped) | own (before shipped) | ✅ before shipped (audited) |
| Download pro-forma | own | own | ✏️ — | ✏️ — | ✅ |
| ✏️ See whether the order is paid | own | own | own sub-orders | own sub-orders | ✅ |
| ✏️ Record buyer payment / refund | — | — | — | — | ✏️ removed by 012 — the worker records card payments |
| ✏️ Request a contract / see contracts | own | own | own | own | read |
| ✏️ Accept / reject a contract request | — | — | own | own | — |
| ✏️ End a contract | own | — | own | — | — |
| ✏️ Pay by card (platform part) | own | own | — | — | read |
| Ledger (view) | — | — | own | — | ✅ |
| ✏️ Record payout / adjustment | — | — | — | — | ✅ (audited) |
| Commission settings & per-supplier report | — | — | — | — | ✅ (audited) |
| Audit log, jobs page | — | — | — | — | ✅ |

**Stretch**
| Action | Buyer owner | Buyer member | Supplier owner | Supplier member | Platform |
|---|---|---|---|---|---|
| S1 set price tiers / buyer prices | — | — | own | own | read |
| S1 see a buyer-specific price | own | own | own (prices they set) | own (prices they set) | ✅ |
| S2 compare | ✅ | ✅ | ✅ | ✅ | ✅ |
| S3 AI attribute suggestions | — | — | own (rate-limited) | own (rate-limited) | — |
| S4 natural-language search | ✅ | ✅ | ✅ | ✅ | ✅ |
| S5 create RFQ / invite / accept quote | own | own | — | — | read |
| S5 see RFQ / submit quote | — | — | only if invited | only if invited | read |
| S7 invite / remove members | own | — | own | — | own |

**Status rules (unchanged from the planning session):** a pending supplier builds its catalogue, invisible to buyers ·
a rejected supplier edits its profile and re-applies (→ pending) · a suspended supplier's products disappear
immediately; it can still read and fulfil existing sub-orders and see its ledger; it cannot edit products or
import · wrong org type opening another area's route → not found · not logged in → login.
Platform org: no owner/member difference except member management (S7).

## 2. Named policies (= `policy.can` actions and the authorization test matrix)
Notation: **B** buyer, **S** supplier, **P** platform; `o` owner, `m` member, `*` both. "Ownership" says which
foreign-key must equal `actor.orgId`. Every row becomes at least two tests: allowed actor ✓, and a foreign org
(same type) → 404. Rows with a role restriction also get a "member → 403" test.

### Account & organization
| Action | Allowed | Ownership | Status preconditions | Audited |
|---|---|---|---|---|
| `org.register` | logged-in user without an org | creates org + member(owner) + profile in one tx | supplier → `pending`, buyer → `approved` | — |
| `org.switchActive` | any member | membership re-checked in `member` | — | — |
| `orgProfile.view` | B\*, S\*, P | own; P all | — | — |
| `orgProfile.update` | Bo, So, P | own; P all (MVP: the platform edits its own organization only) | tax ID: P only (403 otherwise); a tax ID already taken by the same type → 409 `TAX_ID_TAKEN`; type and status are not editable | ✓ (legal data; only the fields that changed) |
| `supplierProfile.viewBankDetails` | So, P | own | members get 403 | — |
| `supplierProfile.updateBankDetails` | So | own | IBAN: Montenegrin, 22 characters, mod-97 check; a change is audited with the number masked | ✓ |
| `supplier.reapply` | So | own | `rejected` → `pending` | ✓ |
| `supplier.approve` | P | — | `pending`; IBAN present | ✓ |
| `supplier.reject` | P | — | `pending`; reason required | ✓ |
| `supplier.suspend` | P | — | `approved` | ✓ |
| `supplier.reinstate` | P | — | `suspended` → `approved` | ✓ |
| `supplier.setCommissionOverride` | P | — | — | ✓ |
| `buyerLocation.list` | B\*, P | own | — | — |
| `buyerLocation.create` / `.update` / `.archive` | B\* | own | the default location cannot be archived (409 `DEFAULT_LOCATION_ARCHIVE`); an archived location cannot be edited; never deleted | — |

### Catalogue
| Action | Allowed | Ownership | Status preconditions | Audited |
|---|---|---|---|---|
| `catalogue.search` (`searchProducts`) | B\*, S\*, P | — | index holds only active products of approved suppliers | — |
| `product.view` | B\*, S\*, P | visible = active + approved supplier, or own, or P | — | — |
| `product.list` (dashboard) | S\* | own | — | — |
| `product.create` / `.update` | S\* | own | supplier not `suspended`; active leaf category; VAT rate from settings; attributes valid; `.update`: product not `archived` | — |
| `product.setStatus` (activate / draft / archive / restore) | S\* | own | supplier not `suspended`; legal transition (`product-status.ts`); activate: all required attributes present | — |
| `product.moderate` (archive only) | P | — | product not archived | ✓ |
| `productImage.upload` / `.delete` / `.reorder` | S\* | own product | supplier not `suspended`; ≤ 8 images | — |
| `csvImport.upload` / `.confirm` / `.cancel` | S\* | own | supplier not `suspended`; one active import | — |
| `csvImport.view` | S\*, P | own; P all | — | — |
| `category.create` / `.update` / `.deactivate` | P | — | depth ≤ 3; no move in MVP | ✓ |
| `attribute.create` / `.update` / `.deactivate` | P | — | additive changes only (decision 10.2) | ✓ |

### Orders & money
| Action | Allowed | Ownership | Status preconditions | Audited |
|---|---|---|---|---|
| `cart.view` / `.addItem` / `.updateItem` / `.removeItem` | B\* | own org's cart | product visible; qty rules | — |
| `checkout.placeOrder` | B\* | own cart | revalidation inside tx (decision 11.8) | — |
| `order.list` / `order.view` | B\*, P | own; P all | — | — |
| `subOrder.list` / `subOrder.view` | B\*, S\*, P | buyer_org_id or supplier_org_id; P all | — | — |
| `subOrder.confirm` | S\* | supplier_org_id | `pending` | — |
| `subOrder.ship` | S\* | supplier_org_id | `confirmed` | — |
| `subOrder.deliver` | S\* | supplier_org_id | `shipped` | — |
| `subOrder.cancel` | B\*, S\*, P | buyer: own order; supplier: own sub-order | B: `pending`; S and P: `pending` or `confirmed`; reason required | ✓ (P only) |
| `invoice.download` | B\*, P | buyer_org_id; P all | PDF rendered | — |
| `payment.recordReceipt` / `.recordRefund` | P | — | order exists | ✓ |
| `agreement.request` | B\* | own (`buyer_org_id`) | supplier `approved`; no open (`requested` / `active`) agreement with it yet | — |
| `agreement.accept` / `.reject` | S\* | `supplier_org_id` | `requested` | — |
| `agreement.end` | Bo, So | `buyer_org_id` or `supplier_org_id` | `active` | — |
| `agreement.view` | B\*, S\*, P | `buyer_org_id` or `supplier_org_id`; P all | — | — |
| `payment.payByCard` | B\* | own order | order has a non-cancelled `platform` sub-order; no payment `pending` | — |
| `payment.view` | B\*, P | `buyer_org_id`; P all | — | — |
| `ledger.view` | So, P | supplier_org_id | — | — |
| `ledger.recordPayout` / `.recordAdjustment` | P | — | — | ✓ |
| `commission.report` | P | — | — | — |
| `settings.update` | P | — | — | ✓ |
| `auditLog.view`, `jobs.view`, `jobs.retry` | P | — | — | — |

### Stretch
| Action | Allowed | Ownership | Status preconditions | Audited |
|---|---|---|---|---|
| `priceTier.manage`, `buyerPrice.manage` | S\* | own product | supplier not `suspended` | — |
| `price.viewBuyerSpecific` | B\*, S\*, P | buyer_org_id (buyer) / supplier_org_id (supplier) | valid date range | — |
| `compare.view` | B\*, S\*, P | visible products | — | — |
| `ai.suggestAttributes` | S\* | own product | rate limit + cost cap | — |
| `search.naturalLanguage` | B\*, S\*, P | — | rate limit; falls back to plain search | — |
| `rfq.create` / `.invite` / `.close` | B\* | own | `open` / `quoted` | — |
| `rfq.view` | B\*, S\* (invited), P | buyer_org_id or invitation | — | — |
| `rfqQuote.submit` / `.withdraw` | S\* | invited | RFQ `open`/`quoted`; before deadline | — |
| `rfqQuote.accept` | B\* | own RFQ | quote `submitted`, not expired → `createOrder(source = rfq)` | — |
| `member.invite` / `member.remove` | Bo, So, Po | own org | — | ✓ |

## 3. Table coverage (every table → owner, RLS, actions)
| Table | Owner org type | RLS policies (rls.sql) | Actions that touch it |
|---|---|---|---|
| Better Auth: `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation` | — | **none** (library-managed; app layer protects them) | `org.register`, `org.switchActive`, `member.*` |
| `org_profiles` | all | own · approved suppliers to logged-in · P · worker read · guard trigger | `org.register`, `orgProfile.*`, `supplier.*` |
| `supplier_profiles` | supplier | owner only · P · guard trigger (commission) | `supplierProfile.*`, `supplier.setCommissionOverride` |
| `buyer_locations` | buyer | own buyer · P read | `buyerLocation.*`, `checkout.placeOrder` |
| `categories` | platform | read: logged-in · write: P | `category.*`, `catalogue.search` |
| `category_attributes` | platform | read: logged-in · write: P | `attribute.*`, `product.create` |
| `products` | supplier | own · visible to logged-in · P (moderate) · worker read | `product.*`, `catalogue.search`, `cart.addItem` |
| `product_images` | supplier | same visibility as product · own write · worker thumbnail update | `productImage.*` |
| `csv_imports` | supplier | own · P read | `csvImport.*` |
| `carts`, `cart_items` | buyer | own buyer only | `cart.*`, `checkout.placeOrder` |
| `orders` | buyer | own buyer · P · no UPDATE grant (derived via `app.recompute_order`) | `checkout.placeOrder`, `order.*` |
| `sub_orders` | buyer + supplier | buyer / supplier / P · buyer may only cancel while pending | `subOrder.*`, `checkout.placeOrder` |
| `order_lines` | buyer + supplier | buyer / supplier / P · insert at checkout only | `checkout.placeOrder`, `subOrder.view` |
| `sub_order_events` | buyer + supplier | buyer / supplier / P · insert must match current status | every `subOrder.*` transition |
| `proforma_invoices` | buyer | buyer / P · v1 by buyer at checkout · worker renders and re-issues | `checkout.placeOrder`, `invoice.download`, `subOrder.cancel` (re-issue job) |
| `order_payments` | buyer | buyer read · worker insert receipts / refunds for a succeeded payment (D5-B0) · append-only | `order.view`, `payment.view`; the worker on gateway events (012: no `payment.record*`) |
| `ledger_entries` | supplier | supplier **owner** read · P · insert checked against sub-order amounts · append-only | `checkout.placeOrder`, `subOrder.cancel`, `ledger.*`, `commission.report` |
| `settings` | platform | read: logged-in · write: P | `settings.update`, `checkout.placeOrder` (commission default) |
| `audit_log` | platform | insert: own actor · read: P · append-only | every audited action, `auditLog.view` |
| `invoice_counters` | platform | no policy at all — only `app.next_invoice_number()` | `checkout.placeOrder` |
| `price_tiers`, `buyer_prices` (S1) | supplier | with product · named buyer · supplier own | `priceTier.manage`, `buyerPrice.manage`, `price.viewBuyerSpecific` |
| `rfq_requests`, `rfq_invitations`, `rfq_quotes` (S5) | buyer / supplier | buyer own · invited supplier · P | `rfq.*`, `rfqQuote.*` |
| `supplier_agreements` (D5-B0) | buyer + supplier | buyer / supplier own · P read · buyer inserts `requested` only · supplier decides, owner of either side ends (column grant + guard trigger) | `agreement.*`, `checkout.placeOrder` (direct mode: `sub_orders_insert` needs an `active` row) |
| `payments` (D5-B0, was S6) | buyer | buyer own read + insert `created`, mark `pending` · worker updates status / provider_ref / refunded_cents · P read | `payment.payByCard`, `payment.view`; the worker on gateway events |
| `payment_events` (D5-B0) | — | worker only (SELECT + INSERT, insert-only); the web login has no grant | none — written by the worker from signed gateway callbacks |
| `product_stock` (D5-B0) | supplier | visible exactly when the product is visible · written by the worker only | `product.view`, `catalogue.search`, `cart.addItem` (stock badge) |

## 4. Rate limits (decision 9.7)
| Action | Limit | Where |
|---|---|---|
| Sign-in | 5 / min per IP + e-mail | Better Auth built-in rate limiter (verify configuration in docs) |
| Password reset request | 3 / hour per e-mail | Better Auth |
| Registration | 5 / hour per IP | Better Auth |
| `csvImport.upload` | 10 / hour per supplier org + 1 active import (DB unique index) | Redis cache instance, fixed window |
| `productImage.upload` (presign) | 60 / hour per supplier org | Redis |
| `checkout.placeOrder` | 10 / min per buyer org | Redis |
| `ai.suggestAttributes` (S3) | 30 / hour per supplier org + daily cost cap | Redis |
| `search.naturalLanguage` (S4) | 20 / min per user | Redis |
Counters live on the cache Redis: if eviction drops a counter, the limit simply resets (accepted).
