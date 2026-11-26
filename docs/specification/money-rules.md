# Money rules (Specification §3.2 / §6.3)

*Member B · task D3-AB1 · state: 25.11.2026, after decision 012.*
The rules, 10 worked examples and test vectors are in
[`docs/decisions-9-11/money-rules.md`](../decisions-9-11/money-rules.md) and
[`money-vectors.json`](../decisions-9-11/money-vectors.json) (unit-test vectors for `src/server/domain/money.ts`).
They were written before decision 012. **This file keeps the parts that are unchanged as a short summary and
states exactly what 012 changed** (sections marked ⟶ 012). Where they disagree, this file wins.

## 1. Rules that did not change
| Rule | Value |
|---|---|
| Money | integer **cents**, EUR, `bigint`; never a float, not in TypeScript either |
| Rates (VAT, commission) | **basis points**: 100 bps = 1 %; VAT 2100 / 1500 / 700 / 0 *(verify with an accountant)* |
| Rounding | **half-up**, in **exactly two places**: VAT **once per line**, commission **once per sub-order** |
| Where arithmetic lives | only `src/server/domain/money.ts`; `amount × bps` is computed with `BigInt` before dividing |
| Totals | sums of already-rounded lines; order totals are derived from sub-orders and **never change after checkout** |
| Commission base | the sub-order **net** (VAT is not the platform's revenue); the rate is **snapshotted** on the sub-order (supplier override, else the platform default) |

```
line_net        = unit_price_cents × quantity                 (exact)
line_vat        = roundDiv(line_net × vat_rate_bps, 10000)    ← rounding #1
line_gross      = line_net + line_vat
sub_order.gross = Σ line_gross            order.gross = Σ sub_order.gross
commission      = roundDiv(sub_order.net × commission_bps, 10000)   ← rounding #2
roundDiv(n, d)  = floor((2n + d) / (2d))      for n ≥ 0
```
Why half-up: it is what invoices in the region use and what a reader checks with a calculator (a tie like
10.5 cents becomes 11). Why not round the total: two lines of 0.50 € at 21 % give VAT 11 + 11 = 22, not 21 —
that is example **E3** and a required test.

## 2. ⟶ 012: purchase mode per sub-order
Each sub-order is `direct` or `platform`, chosen per supplier group in the cart. **Commission is charged in both
modes, with the same formula.** What differs is who holds the money:

| | **platform** (card) | **direct** (active contract) |
|---|---|---|
| Buyer pays | the platform, by card, the **gross** | the supplier, outside the platform |
| Supplier is owed | **payable = gross − commission** (the VAT is the supplier's, so the platform passes it on) | nothing from the platform; the supplier **owes the commission** |
| Pro-forma | yes (this sub-order is part of it) | no |

No `payment_method` column exists any more — the mode **is** the payment information.

## 3. ⟶ 012: ledger
Sign: **+ = the platform owes the supplier more.** A balance **may be negative** (a direct-mode supplier owes
commission). Append-only: corrections are new entries.

| Event | platform | direct |
|---|---|---|
| Checkout transaction | `sale` **+gross**, `commission` **−commission** | `commission` **−commission** only |
| Cancellation | `sale_reversal` −gross, `commission_reversal` +commission | `commission_reversal` +commission only |
| Supplier pays its commission | — | **`commission_payment` +amount** (the admin records it; audited) |
| Payout / correction by the admin | `payout` −amount · `adjustment` ±amount | `adjustment` only |

Database guards (RLS insert policies, see `APPLIED.md` §4): `sale` is refused for a direct sub-order;
`sale_reversal` is refused for a direct sub-order; `commission_payment` must be > 0; each sub-order-linked
entry exists at most once per sub-order, so a retry cannot double-book.

**Invariants** (tests, with fast-check property tests):
1. `order.gross = Σ sub_order.gross`, and `sub_order.gross = Σ line_gross`
2. platform: **payable + commission = sub-order gross**
3. direct: the sub-order's entries sum to **−commission**
4. `0 ≤ commission ≤ sub-order net`; no negative amounts
5. supplier balance = `Σ ledger_entries.amount_cents`
6. after a cancellation, that sub-order's entries sum to **0**
7. `orders.net / vat / gross` never change after checkout

**Direct-mode commission and payouts (netting):** a supplier selling in both modes has its direct-mode commission
netted against its platform payouts. This is the default of 012 §2 and is **still to be confirmed with the
mentors** (012 §14.4); the commission is charged at order placement and reversed on cancellation (§14.5, also
unconfirmed).

## 4. ⟶ 012: derived statuses
**Order status** (written only by `app.recompute_order()`): all sub-orders cancelled → `cancelled`; all in
{delivered, cancelled} → `completed`; otherwise `in_progress`. *(Unchanged.)*

**Payment status** — buyer pays the platform, and only for the **platform part**:
```
amount_due  = Σ gross of NON-cancelled sub-orders with mode = 'platform'
amount_paid = Σ order_payments.receipt − Σ order_payments.refund
payment_status = not_applicable  if the order has no platform sub-order
                 refund_due      if amount_paid > amount_due
                 paid            if amount_paid = amount_due and amount_due > 0
                 unpaid          otherwise
```
Receipts and refunds are inserted by **the worker** from signed gateway events (duplicates are no-ops; amount and
currency are checked) — the manual "record buyer payment" screen no longer exists.
**Shipping waits for payment (mentor answer M2):** `subOrder.ship` requires `paid` for a platform sub-order;
confirming earlier is allowed; direct sub-orders do not wait.

> **Open detail for D4-B1:** if the order *has* platform sub-orders but **all of them are cancelled**, the rule
> above gives `unpaid` (or `paid`/`refund_due` if money moved). `APPLIED.md` only says `not_applicable` for "no
> platform sub-order". I will decide this in D4-B1 and record it in `APPLIED.md`.

## 5. ⟶ 012: pro-forma invoice
One per order, issued by the platform, **only for the platform part** — its totals are the platform sub-orders'
totals, not the order's. Created **once at checkout** (same transaction), rendered once by a job, never
regenerated. An order with no platform part gets none. Number `PF-<year>-<6 digits>` from a **normal sequence**
(`app.next_invoice_number()` keeps its name; a rolled-back checkout may leave a gap — acceptable for a
non-fiscal document). **No re-issue after a cancellation** (`version` stays 1): the PDF keeps its original total
and the order page shows the amount due. "Paid" is shown on the order page, not in the PDF. The PDF says
"PRO-FORMA — not a fiscal invoice". Due date = issue date + `settings.invoice_due_days` (one integer, 8).
Mandatory invoice content for Montenegro: **verify** (mentor answer M4: not critical, simple layout).

## 6. ⟶ 012: refunds and expiry
- **Refund** only as the result of cancelling a **paid** platform sub-order **before shipping**, for that
  sub-order's gross. The reversals are booked at cancellation; the gateway's refund callback only records the
  `refund` row and `payments.refunded_cents`. No separate admin refund action.
- A buyer cannot cancel a platform sub-order while its payment is `pending` (409).
- An unpaid platform part **expires after 30 minutes**; before cancelling, the job asks the gateway for the real
  status, so a late callback cannot lose a paid order. Cancellation by the system goes through
  `app.system_cancel_sub_order(id, reason)` (executable by `horeca_worker` only), which books the reversals for
  the sub-order's mode.

## 7. Quantity rules *(unchanged)*
`quantity ≥ min_order_qty` and `quantity % order_step = 0` — checked when adding to the cart and again inside
the checkout transaction.

## 8. Worked examples
**E1–E10** in `docs/decisions-9-11/money-rules.md` stay valid as unit-test vectors for the arithmetic (E1–E6,
E10 and the platform-mode parts of E5, E8, E9). **Superseded by 012:** E7's "pro-forma v2" (no re-issue) and the
"payment recorded by the platform" steps of E8 (the worker records them). Two new examples, computed from E5's
numbers, added in D4-B1 as `src/server/domain/money-vectors-012.json` (the original `money-vectors.json` stays untouched) and tested in `money.test.ts`:

### E11 — mixed modes in one checkout (E5, with supplier C ordered **directly**)
| Sub-order | Mode | Net | VAT | Gross | Commission | Ledger entries | Balance |
|---|---|---:|---:|---:|---:|---|---:|
| A | platform | 159000 | 33390 | 192390 | 12720 | +192390 / −12720 | **179670** |
| B | platform | 30000 | 6300 | 36300 | 2400 | +36300 / −2400 | **33900** |
| C (override 650 bps) | direct | 9600 | 2016 | 11616 | 624 | −624 | **−624** |
| **Order** | | **198600** | **41706** | **240306** | **15744** | | |

- Pro-forma = platform part only: net 189000, VAT 39690, **gross 228690** → 2.286,90 € (not 2.403,06 €).
- Amount due (card) = **228690**; the order's own gross stays 240306.
- C owes 624; when the admin records `commission_payment +624`, C's balance is **0**.

### E12 — cancellations in the mixed order (E11)
- **B cancels while paid:** `sale_reversal −36300`, `commission_reversal +2400` → B's balance **0**. Amount due
  becomes 192390 while 228690 was paid → `refund_due` (36300) until the gateway's refund callback is recorded,
  then `paid`. The stored pro-forma still shows 228690.
- **C cancels (direct):** only `commission_reversal +624` → C's entries sum to **0**; no `sale_reversal`
  (the database refuses one); the order's amount due is unchanged.
