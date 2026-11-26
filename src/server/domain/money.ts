/**
 * Money — the ONLY place where amounts are multiplied, divided or rounded (D2-B3, CLAUDE.md rule 7).
 * Specification: docs/decisions-9-11/money-rules.md · test vectors: money-vectors.json.
 *
 *   amounts   integer cents (EUR), JS `number` (exact up to 2^53; the database column is bigint)
 *   rates     basis points: 2100 = 21 %
 *   rounding  half-up, in exactly two places: VAT once per LINE, commission once per SUB-ORDER (on net)
 *
 * `amount × rate` is computed with BigInt, so the intermediate product never loses precision.
 * Everything else (sub-order and order totals, payable) is a sum or difference of rounded integers.
 */

export type Cents = number;
export type BasisPoints = number;

// BigInt(…) instead of literals like 10_000n: tsconfig targets ES2017, where BigInt literals are not allowed.
const ZERO = BigInt(0);
const TWO = BigInt(2);
const BPS = BigInt(10_000);

function assertCents(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${name} must be a non-negative integer number of cents, got ${value}`,
    );
  }
}

function assertBps(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new RangeError(
      `${name} must be an integer between 0 and 10000 basis points, got ${value}`,
    );
  }
}

function toSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError("Amount exceeds the safe integer range");
  return Number(value);
}

/**
 * Integer division rounded half-up: floor((2n + d) / (2d)), for n ≥ 0 and d > 0.
 * Example: 105 / 10 = 10.5 → 11 (half-even would give 10).
 */
export function roundDiv(n: bigint, d: bigint): bigint {
  if (n < ZERO || d <= ZERO)
    throw new RangeError("roundDiv expects n >= 0 and d > 0");
  return (TWO * n + d) / (TWO * d); // BigInt division truncates, which is floor for non-negative values
}

export type LineInput = {
  unitPriceCents: Cents;
  quantity: number;
  vatRateBps: BasisPoints;
};
export type LineAmounts = {
  netCents: Cents;
  vatCents: Cents;
  grossCents: Cents;
};

/** One order line: net exact, VAT rounded once (rounding #1), gross = net + VAT. */
export function lineAmounts({
  unitPriceCents,
  quantity,
  vatRateBps,
}: LineInput): LineAmounts {
  assertCents(unitPriceCents, "unitPriceCents");
  if (!Number.isSafeInteger(quantity) || quantity < 1)
    throw new RangeError(
      `quantity must be a positive integer, got ${quantity}`,
    );
  assertBps(vatRateBps, "vatRateBps");

  const net = BigInt(unitPriceCents) * BigInt(quantity);
  const vat = roundDiv(net * BigInt(vatRateBps), BPS);
  return {
    netCents: toSafeNumber(net),
    vatCents: toSafeNumber(vat),
    grossCents: toSafeNumber(net + vat),
  };
}

/** Sub-order or order totals: sums of already-rounded amounts — never re-rounded. */
export function sumAmounts(parts: readonly LineAmounts[]): LineAmounts {
  let net = ZERO;
  let vat = ZERO;
  for (const p of parts) {
    net += BigInt(p.netCents);
    vat += BigInt(p.vatCents);
  }
  return {
    netCents: toSafeNumber(net),
    vatCents: toSafeNumber(vat),
    grossCents: toSafeNumber(net + vat),
  };
}

/** Platform commission on the sub-order NET (rounding #2). */
export function commissionCents(
  subOrderNetCents: Cents,
  commissionBps: BasisPoints,
): Cents {
  assertCents(subOrderNetCents, "subOrderNetCents");
  assertBps(commissionBps, "commissionBps");
  return toSafeNumber(
    roundDiv(BigInt(subOrderNetCents) * BigInt(commissionBps), BPS),
  );
}

/** What the platform owes the supplier for a sub-order: gross − commission (money-rules.md §3). */
export function payableCents(
  subOrderGrossCents: Cents,
  commission: Cents,
): Cents {
  assertCents(subOrderGrossCents, "subOrderGrossCents");
  assertCents(commission, "commission");
  if (commission > subOrderGrossCents)
    throw new RangeError("commission cannot exceed the sub-order gross");
  return subOrderGrossCents - commission;
}

// ── Purchase modes, ledger entries and payment status (decision 012, D4-B1) ─────────────────────────────

export type PurchaseMode = "direct" | "platform";

/** The four ledger entry types a sub-order produces itself (payout, adjustment, commission_payment are admin actions). */
export type SubOrderLedgerType =
  "sale" | "commission" | "sale_reversal" | "commission_reversal";

/** One ledger row to insert. Sign: + = the platform owes the supplier more (CLAUDE.md rule 9). */
export type LedgerLine = { type: SubOrderLedgerType; amountCents: number };

export type SubOrderMoney = {
  mode: PurchaseMode;
  grossCents: Cents;
  commissionCents: Cents;
};

function assertSubOrderMoney(s: SubOrderMoney): void {
  assertCents(s.grossCents, "grossCents");
  assertCents(s.commissionCents, "commissionCents");
  if (s.commissionCents > s.grossCents)
    throw new RangeError("commission cannot exceed the sub-order gross");
}

/**
 * Entries written when a sub-order is created (checkout).
 * platform: sale +gross and commission −commission (the platform owes gross − commission);
 * direct:   commission −commission only (the supplier received the money itself and now owes the commission).
 * The commission row is written even when it is 0 (a 0 bps override): the database allows `commission ≤ 0`, and
 * "every sub-order has a commission entry" keeps the ledger uniform. `sale` must be > 0, so a free order writes none.
 */
export function checkoutLedgerEntries(s: SubOrderMoney): LedgerLine[] {
  assertSubOrderMoney(s);
  const lines: LedgerLine[] = [];
  if (s.mode === "platform" && s.grossCents > 0)
    lines.push({ type: "sale", amountCents: s.grossCents });
  lines.push({ type: "commission", amountCents: -s.commissionCents });
  return lines;
}

/**
 * Entries written when a sub-order is cancelled: the exact opposite of its checkout entries, so they sum to 0.
 * direct mode never gets a `sale_reversal` — there was no `sale` to reverse.
 */
export function cancellationLedgerEntries(s: SubOrderMoney): LedgerLine[] {
  assertSubOrderMoney(s);
  const lines: LedgerLine[] = [];
  if (s.mode === "platform" && s.grossCents > 0)
    lines.push({ type: "sale_reversal", amountCents: -s.grossCents });
  lines.push({
    type: "commission_reversal",
    amountCents: s.commissionCents,
  });
  return lines;
}

/** Balance = Σ entries. It MAY be negative (a direct-mode supplier owes its commission). */
export function ledgerBalance(
  entries: readonly { amountCents: number }[],
): number {
  let sum = 0;
  for (const e of entries) {
    if (!Number.isSafeInteger(e.amountCents))
      throw new RangeError(
        `ledger amount must be an integer, got ${e.amountCents}`,
      );
    sum += e.amountCents;
    if (!Number.isSafeInteger(sum))
      throw new RangeError("Ledger balance exceeds the safe integer range");
  }
  return sum;
}

/** What the buyer owes the platform by card: gross of the NON-cancelled platform sub-orders only. */
export function amountDueCents(
  subOrders: readonly {
    mode: PurchaseMode;
    cancelled: boolean;
    grossCents: Cents;
  }[],
): Cents {
  let due = ZERO;
  for (const s of subOrders) {
    assertCents(s.grossCents, "grossCents");
    if (s.mode === "platform" && !s.cancelled) due += BigInt(s.grossCents);
  }
  return toSafeNumber(due);
}

export type OrderPaymentStatus =
  "unpaid" | "paid" | "refund_due" | "not_applicable";

/**
 * `orders.payment_status` (APPLIED.md §4 · D4-B1). `paidCents` = Σ receipts − Σ refunds.
 *   paid > due → refund_due · due = 0 → not_applicable · paid = due → paid · otherwise unpaid.
 * The order of the checks matters: with due = 0 and paid > 0 (everything cancelled after payment) the buyer is
 * owed a refund, so `refund_due` wins over `not_applicable`.
 */
export function paymentStatus(
  dueCents: Cents,
  paidCents: Cents,
): OrderPaymentStatus {
  assertCents(dueCents, "dueCents");
  assertCents(paidCents, "paidCents");
  if (paidCents > dueCents) return "refund_due";
  if (dueCents === 0) return "not_applicable";
  if (paidCents === dueCents) return "paid";
  return "unpaid";
}
