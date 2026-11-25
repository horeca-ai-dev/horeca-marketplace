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
