/**
 * money.ts — worked examples from money-vectors.json + fast-check properties (D2-B3).
 * The vectors file is the spec (computed by tools/money_vectors.py): if a test fails, money.ts is wrong.
 */
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  commissionCents,
  lineAmounts,
  payableCents,
  roundDiv,
  sumAmounts,
  type LineAmounts,
} from "./money";

type VLine = {
  unit_price_cents: number;
  quantity: number;
  vat_rate_bps: number;
  line_net_cents: number;
  line_vat_cents: number;
  line_gross_cents: number;
};
type VSubOrder = {
  lines: VLine[];
  net_cents: number;
  vat_cents: number;
  gross_cents: number;
  commission_bps: number;
  commission_cents: number;
  payable_cents: number;
};

const vectors = JSON.parse(
  readFileSync(
    new URL("../../../docs/decisions-9-11/money-vectors.json", import.meta.url),
    "utf8",
  ),
) as {
  E1_single_line: VLine;
  E2_half_up_tie: VLine;
  E3_round_per_line: VSubOrder;
  E4_mixed_vat: VSubOrder;
  E5_three_supplier_checkout: {
    sub_orders: Record<string, VSubOrder>;
    order: { net_cents: number; vat_cents: number; gross_cents: number };
  };
  E6_commission_rounding: {
    net_cents: number;
    commission_bps: number;
    commission_cents: number;
  }[];
};

const line = (v: VLine) =>
  lineAmounts({
    unitPriceCents: v.unit_price_cents,
    quantity: v.quantity,
    vatRateBps: v.vat_rate_bps,
  });

function subOrder(v: VSubOrder) {
  const totals = sumAmounts(v.lines.map(line));
  const commission = commissionCents(totals.netCents, v.commission_bps);
  return {
    ...totals,
    commission,
    payable: payableCents(totals.grossCents, commission),
  };
}

describe("money vectors", () => {
  it.each([
    ["E1 single line", vectors.E1_single_line],
    ["E2 half-up tie", vectors.E2_half_up_tie],
  ])("%s", (_name, v) => {
    expect(line(v)).toEqual({
      netCents: v.line_net_cents,
      vatCents: v.line_vat_cents,
      grossCents: v.line_gross_cents,
    });
  });

  const subOrderCases: [string, VSubOrder][] = [
    ["E3 round per line", vectors.E3_round_per_line],
    ["E4 mixed VAT", vectors.E4_mixed_vat],
    ...Object.entries(vectors.E5_three_supplier_checkout.sub_orders).map(
      ([k, v]): [string, VSubOrder] => [`E5 sub-order ${k}`, v],
    ),
  ];
  it.each(subOrderCases)("%s", (_name, v) => {
    expect(subOrder(v)).toEqual({
      netCents: v.net_cents,
      vatCents: v.vat_cents,
      grossCents: v.gross_cents,
      commission: v.commission_cents,
      payable: v.payable_cents,
    });
  });

  it("E5 order totals are the sums of the sub-orders", () => {
    const e5 = vectors.E5_three_supplier_checkout;
    const order = sumAmounts(
      Object.values(e5.sub_orders).map((s) => sumAmounts(s.lines.map(line))),
    );
    expect(order).toEqual({
      netCents: e5.order.net_cents,
      vatCents: e5.order.vat_cents,
      grossCents: e5.order.gross_cents,
    });
  });

  it.each(vectors.E6_commission_rounding)(
    "E6 commission $net_cents × $commission_bps bps",
    (v) => {
      expect(commissionCents(v.net_cents, v.commission_bps)).toBe(
        v.commission_cents,
      );
    },
  );
});

// ── properties ──────────────────────────────────────────────────────────────
const price = fc.integer({ min: 0, max: 10_000_000 }); // up to 100,000.00 EUR per unit
const qty = fc.integer({ min: 1, max: 10_000 });
const vatBps = fc.constantFrom(2100, 1500, 700, 0);
const commissionBps = fc.integer({ min: 0, max: 10_000 });
const lineArb = fc.record({
  unitPriceCents: price,
  quantity: qty,
  vatRateBps: vatBps,
});

describe("money properties", () => {
  it("roundDiv is half-up: |n/d − r| ≤ 1/2, and an exact half rounds up", () => {
    fc.assert(
      // BigInt(…) instead of literals: tsconfig targets ES2017.
      fc.property(
        fc.bigInt({ min: BigInt(0), max: BigInt(10) ** BigInt(15) }),
        fc.bigInt({ min: BigInt(1), max: BigInt(10) ** BigInt(6) }),
        (n, d) => {
          const r = roundDiv(n, d);
          const one = BigInt(1);
          const two = BigInt(2);
          // (2r − 1)·d ≤ 2n < (2r + 1)·d  ⇔  r − 1/2 ≤ n/d < r + 1/2
          return (
            (two * r - one) * d <= two * n && two * n < (two * r + one) * d
          );
        },
      ),
    );
  });

  it("a line's gross is net + VAT, and VAT is the rounded exact value", () => {
    fc.assert(
      fc.property(lineArb, (l) => {
        const a = lineAmounts(l);
        const exactTimes2 = 2 * a.netCents * l.vatRateBps; // compare 2·vat·10000 with 2·net·bps (± 10000)
        return (
          a.netCents === l.unitPriceCents * l.quantity &&
          a.grossCents === a.netCents + a.vatCents &&
          Math.abs(2 * a.vatCents * 10_000 - exactTimes2) <= 10_000
        );
      }),
    );
  });

  it("sub-order: totals are sums of lines; payable + commission = gross; 0 ≤ commission ≤ net", () => {
    fc.assert(
      fc.property(
        fc.array(lineArb, { minLength: 1, maxLength: 20 }),
        commissionBps,
        (lines, bps) => {
          const amounts: LineAmounts[] = lines.map(lineAmounts);
          const s = sumAmounts(amounts);
          const c = commissionCents(s.netCents, bps);
          const p = payableCents(s.grossCents, c);
          return (
            s.grossCents ===
              amounts.reduce((sum, a) => sum + a.grossCents, 0) &&
            p + c === s.grossCents &&
            c >= 0 &&
            c <= s.netCents
          );
        },
      ),
    );
  });

  it("rejects floats and negative amounts", () => {
    expect(() =>
      lineAmounts({ unitPriceCents: 12.5, quantity: 1, vatRateBps: 2100 }),
    ).toThrow(RangeError);
    expect(() =>
      lineAmounts({ unitPriceCents: -1, quantity: 1, vatRateBps: 2100 }),
    ).toThrow(RangeError);
    expect(() => commissionCents(100, 650.5)).toThrow(RangeError);
  });
});
