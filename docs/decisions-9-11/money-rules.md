# Money rules — decision 11

These rules are the specification for `src/server/domain/money.ts` and its tests. Every number in the
worked examples was computed by the reference implementation `tools/money_vectors.py` (integers only)
and is also in **`money-vectors.json`**, which the Vitest suite should load as test vectors.

## 1. Units
| Quantity | Unit | Column type |
|---|---|---|
| Money | integer **cents**, EUR | Postgres `bigint` (Drizzle `bigint({ mode: "number" })`) |
| VAT rate, commission rate | **basis points** (100 bps = 1 %; 2100 = 21 %) | `integer` |
| Quantity | integer units of the product's `unit` | `integer` |

No floats anywhere — not in the database, not in TypeScript arithmetic. `mode: "number"` is exact up to
2^53 cents (≈ 90 trillion EUR). Inside `money.ts`, compute `amount × bps` with `BigInt` before dividing, so an
intermediate product can never lose precision, and convert back to `number` at the end.

## 2. Rounding
- **Mode: half-up** — a remainder of exactly one half rounds up (away from zero). All amounts we round are
  non-negative; reversals negate an already-rounded value, they are never rounded themselves.
- Integer formula: `roundDiv(n, d) = floor((2n + d) / (2d))` for `n ≥ 0`.
- **Where:** exactly two places — **VAT once per line**, **commission once per sub-order**. Nothing else is
  ever rounded; every other amount is a sum of already-rounded integers.
- Why half-up and not half-even: it is what accountants and invoices in the region use and what a reader
  checks with a calculator. Half-even's statistical neutrality does not matter at our volumes. *(Verify with an accountant before a real launch.)*

## 3. Formulas
```
line_net    = unit_price_cents × quantity                       (exact, no rounding)
line_vat    = roundDiv(line_net × vat_rate_bps, 10000)          ← rounding #1, per line
line_gross  = line_net + line_vat

sub_order.net   = Σ line_net          sub_order.vat = Σ line_vat          sub_order.gross = net + vat
order.net       = Σ sub_order.net     order.vat     = Σ sub_order.vat     order.gross     = net + vat

commission_bps   = supplier_profiles.commission_override_bps ?? settings.default_commission_bps   (snapshotted)
commission_cents = roundDiv(sub_order.net × commission_bps, 10000)                              ← rounding #2
payable_cents    = sub_order.gross − commission_cents          (what the platform owes the supplier)
```
- **Unit price** = `PricingResolver` result (MVP: `products.base_price_cents`; S1: buyer > tier > base),
  stored on the line with `price_source`.
- **VAT rate** = the product's `vat_rate_bps`, copied onto the line. Allowed rates live in
  `settings.vat_rates_bps`; Montenegro: 21 % standard, 7 % reduced, 0 % — **verify** the current list.
- **VAT summary on documents** = group the already-rounded lines by rate (`vat_breakdown`); never recompute VAT on the group.
- **Commission base = sub-order NET** (VAT is not the platform's revenue). Commission is charged once per
  sub-order, not per line.
- **Why `payable = gross − commission`:** the buyer pays the platform the gross amount; the VAT belongs to the
  supplier (the seller, who reports it), so the platform must pass it on. *(This differs from CLAUDE.md's
  invariant "payable + commission = net" — see REVIEW-FINDINGS F2.)* VAT on the commission itself is out of scope — **verify**.

**Invariants** (fast-check property tests):
1. `order.gross = Σ sub_order.gross` and `sub_order.gross = Σ line_gross`
2. `payable + commission = sub_order.gross`
3. `0 ≤ commission ≤ sub_order.net`; no negative line, sub-order or order amount
4. supplier balance = `Σ ledger_entries.amount_cents`
5. after a cancellation, the cancelled sub-order's entries sum to 0
6. `orders.net/vat/gross` never change after checkout (amount due is derived, §6)

## 4. Ledger
Sign: **+ = the platform owes the supplier more.**

| Event | Written in | Entries |
|---|---|---|
| Checkout | the checkout transaction | `sale` **+gross**, `commission` **−commission** (per sub-order) |
| Sub-order cancelled (by buyer, supplier or platform) | the cancellation transaction, after the status update | `sale_reversal` **−gross**, `commission_reversal` **+commission** |
| Payout recorded by the platform (no real money) | payout action | `payout` **−amount** |
| Correction by the platform | adjustment action | `adjustment` **±amount** + description |

- Each of sale, commission, sale_reversal and commission_reversal exists **at most once per sub-order** (unique index), so retries cannot double-book.
- The RLS insert policies also check the amounts against the sub-order (exactly +gross / −commission / mirrored reversals).
- Append-only: no UPDATE or DELETE privilege. A mistake is corrected with an `adjustment`.

**Balance queries** (supplier ledger screen, admin overview):
```
balance  = Σ amount_cents                                              (all entries of the supplier)
earned   = Σ sale + commission  of sub-orders in status 'delivered'
pending  = Σ sale + commission  of sub-orders in 'pending' | 'confirmed' | 'shipped'
ready_for_payout = Σ sale + commission of DELIVERED sub-orders whose order is paid (or refund_due)
                   + Σ payout + adjustment
```
Cancelled sub-orders contribute 0 (entry + reversal cancel out).
**Platform commission per supplier** (admin screen, DoD "admin sees commission per supplier") =
`−Σ (commission + commission_reversal)` of that supplier = Σ `commission_cents` of its non-cancelled sub-orders;
the "earned" column counts only delivered ones, "pending" the rest.

## 5. Order status (derived)
Written only by `app.recompute_order(order_id)`, called by `transition()` in the same transaction:
- all sub-orders `cancelled` → `cancelled`
- all sub-orders in {`delivered`, `cancelled`} → `completed`
- otherwise → `in_progress`

## 6. Payment status (derived) — buyer pays the platform
```
amount_due   = Σ gross of sub-orders that are NOT cancelled
amount_paid  = Σ order_payments.receipt − Σ order_payments.refund
payment_status = refund_due  if amount_paid > amount_due
                 paid        if amount_paid = amount_due and amount_due > 0
                 unpaid      otherwise   (incl. "everything cancelled, nothing paid")
```
In the MVP the payment status is **informational**: shipping does not wait for payment (decision 11.10, open question Q3).

## 7. Quantity rules
`quantity ≥ min_order_qty` **and** `quantity % order_step = 0`. Checked when adding to the cart and again inside the checkout transaction.

---

## Worked examples (= unit-test vectors)

### E1 — one line
2 × 489.00 € at 21 %: net `48900 × 2 = 97800`; VAT `97800 × 2100 / 10000 = 20538` (exact); gross **118338** → 1.183,38 €.

### E2 — half-up at an exact tie
0.25 € × 2 at 21 %: net 50; VAT `50 × 2100 / 10000 = 10.5` → **11** cents (half-even would give 10).

### E3 — round per line, not the total
Two lines of 0.50 € at 21 %: each VAT `10.5 → 11` → sub-order VAT **22** cents. Rounding the total (1.00 € × 21 % = 21) would give 21 — **wrong under our rule**. Documents show 22.

### E4 — mixed VAT rates in one sub-order (rates: verify)
| Line | Net | Rate | VAT |
|---|---:|---:|---:|
| Prep table 1 × 612.00 | 61200 | 21 % | 12852 |
| Napkins 4 × 13.50 | 5400 | 7 % | 378 |
| **Sub-order** | **66600** | | **13230** → gross **79830** |

VAT breakdown: 21 % → net 61200 / VAT 12852; 7 % → net 5400 / VAT 378. Commission 8 %: `66600 × 800 / 10000` = **5328**.

### E5 — three-supplier cart (one checkout → three sub-orders)
| Sub-order | Lines | Net | VAT | Gross | Rate | Commission | Payable |
|---|---|---:|---:|---:|---:|---:|---:|
| A | 2 × 489.00 + 1 × 612.00 | 159000 | 33390 | 192390 | 800 (default) | 12720 | 179670 |
| B | 40 × 7.50 | 30000 | 6300 | 36300 | 800 (default) | 2400 | 33900 |
| C | 5 × 19.20 | 9600 | 2016 | 11616 | 650 (override) | 624 | 10992 |
| **Order** | | **198600** | **41706** | **240306** | | **15744** | |

Ledger at checkout: A +192390 / −12720 · B +36300 / −2400 · C +11616 / −624. Balances: A **179670**, B **33900**, C **10992**. Pro-forma v1: PF-2026-…, 2.403,06 €.

### E6 — commission rounding (once per sub-order)
| Net | Rate | Exact | Commission |
|---:|---:|---:|---:|
| 100 | 650 | 6.5 | **7** |
| 123457 | 650 | 8024.705 | **8025** |
| 99 | 800 | 7.92 | **8** |

### E7 — cancellation after checkout (B cancels its pending sub-order)
New entries for B: `sale_reversal −36300`, `commission_reversal +2400` → B's balance **0**; A and C unchanged.
`orders` totals stay 240306 (history); amount due becomes `192390 + 11616 = ` **204006**. The worker issues pro-forma **v2** (`PF-2026-…/2`): net 168600, VAT 35406, gross 204006; v1 is marked superseded.

### E8 — payment status through a cancellation
| Step | Paid | Due | Status |
|---|---:|---:|---|
| After checkout | 0 | 240306 | unpaid |
| Platform records receipt 2.403,06 € | 240306 | 240306 | paid |
| B cancelled (E7) | 240306 | 204006 | **refund_due** (36300) |
| Platform records refund 363,00 € | 204006 | 204006 | paid |
| (other order) everything cancelled, nothing paid | 0 | 0 | unpaid |

### E9 — balance split and payout
A delivered and its order is paid → earned **179670**, ready for payout 179670; platform records `payout −179670` → balance **0**.
C still pending → pending **10992**, not ready for payout.

### E10 — quantity rules (min 6, step 6)
3 ✗ (below minimum) · 6 ✓ · 10 ✗ (not a multiple of 6) · 12 ✓.
