/**
 * money.ts — worked examples from money-vectors.json + fast-check properties (D2-B3).
 * The vectors file is the spec (computed by tools/money_vectors.py): if a test fails, money.ts is wrong.
 */
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  amountDueCents,
  cancellationLedgerEntries,
  checkoutLedgerEntries,
  commissionCents,
  ledgerBalance,
  lineAmounts,
  paymentStatus,
  payableCents,
  roundDiv,
  sumAmounts,
  type LedgerLine,
  type LineAmounts,
  type PurchaseMode,
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

// ── decision 012: purchase modes, ledger entries, payment status ──────────────────────────────────────────
type V012SubOrder = {
  mode: PurchaseMode;
  gross_cents: number;
  commission_cents: number;
  entries: [string, number][];
  balance_cents: number;
};
const v012 = JSON.parse(
  readFileSync(new URL("./money-vectors-012.json", import.meta.url), "utf8"),
) as {
  E11_mixed_modes: {
    sub_orders: Record<string, V012SubOrder>;
    order_gross_cents: number;
    amount_due_cents: number;
    c_balance_after_commission_payment_cents: number;
  };
  E12_cancellations: {
    b_cancels_while_paid: {
      reversal_entries: [string, number][];
      b_balance_cents: number;
      paid_cents: number;
      amount_due_after_cents: number;
      status_before_refund: string;
      paid_after_refund_cents: number;
      status_after_refund: string;
    };
    c_cancels_direct: {
      reversal_entries: [string, number][];
      c_balance_cents: number;
      amount_due_unchanged_cents: number;
    };
  };
};

const moneyOf = (v: V012SubOrder) => ({
  mode: v.mode,
  grossCents: v.gross_cents,
  commissionCents: v.commission_cents,
});
const asPairs = (lines: LedgerLine[]) =>
  lines.map((l) => [l.type, l.amountCents]);

describe("E11 mixed modes (money-vectors-012.json)", () => {
  const e11 = v012.E11_mixed_modes;

  it.each(Object.entries(e11.sub_orders))(
    "sub-order %s: checkout entries and balance",
    (_name, v) => {
      const entries = checkoutLedgerEntries(moneyOf(v));
      expect(asPairs(entries)).toEqual(v.entries);
      expect(ledgerBalance(entries)).toBe(v.balance_cents);
    },
  );

  it("the sub-order amounts of E11 are the E5 amounts (C ordered directly)", () => {
    // Ties E11 back to the arithmetic of E5, so the two vector files cannot drift apart.
    const e5 = vectors.E5_three_supplier_checkout.sub_orders;
    for (const key of ["A", "B", "C"]) {
      const s = subOrder(e5[key]!);
      const v = e11.sub_orders[key]!;
      expect(s.grossCents).toBe(v.gross_cents);
      expect(s.commission).toBe(v.commission_cents);
    }
  });

  it("order gross is 240306 but the amount due is the platform part only: 228690", () => {
    const subs = Object.values(e11.sub_orders).map((v) => ({
      mode: v.mode,
      cancelled: false,
      grossCents: v.gross_cents,
    }));
    expect(subs.reduce((sum, s) => sum + s.grossCents, 0)).toBe(
      e11.order_gross_cents,
    );
    expect(amountDueCents(subs)).toBe(e11.amount_due_cents);
  });

  it("C's commission payment brings its balance to 0", () => {
    const c = e11.sub_orders.C!;
    const entries = [
      ...checkoutLedgerEntries(moneyOf(c)),
      { amountCents: -c.balance_cents }, // commission_payment: + what C paid
    ];
    expect(ledgerBalance(entries)).toBe(
      e11.c_balance_after_commission_payment_cents,
    );
  });
});

describe("E12 cancellations (money-vectors-012.json)", () => {
  const e12 = v012.E12_cancellations;
  const e11 = v012.E11_mixed_modes;

  it("B cancels while paid: reversals bring B to 0 and the buyer is owed a refund", () => {
    const b = e12.b_cancels_while_paid;
    const sb = moneyOf(e11.sub_orders.B!);
    const reversal = cancellationLedgerEntries(sb);
    expect(asPairs(reversal)).toEqual(b.reversal_entries);
    expect(ledgerBalance([...checkoutLedgerEntries(sb), ...reversal])).toBe(
      b.b_balance_cents,
    );

    const after = amountDueCents([
      { mode: "platform", cancelled: false, grossCents: 192390 },
      { mode: "platform", cancelled: true, grossCents: 36300 },
      { mode: "direct", cancelled: false, grossCents: 11616 },
    ]);
    expect(after).toBe(b.amount_due_after_cents);
    expect(paymentStatus(after, b.paid_cents)).toBe(b.status_before_refund);
    expect(paymentStatus(after, b.paid_after_refund_cents)).toBe(
      b.status_after_refund,
    );
  });

  it("C cancels (direct): only the commission is reversed; the amount due does not move", () => {
    const c = e12.c_cancels_direct;
    const sc = moneyOf(e11.sub_orders.C!);
    const reversal = cancellationLedgerEntries(sc);
    expect(asPairs(reversal)).toEqual(c.reversal_entries);
    expect(ledgerBalance([...checkoutLedgerEntries(sc), ...reversal])).toBe(
      c.c_balance_cents,
    );
    expect(
      amountDueCents([
        { mode: "platform", cancelled: false, grossCents: 192390 },
        { mode: "platform", cancelled: false, grossCents: 36300 },
        { mode: "direct", cancelled: true, grossCents: 11616 },
      ]),
    ).toBe(c.amount_due_unchanged_cents);
  });
});

describe("paymentStatus", () => {
  it.each([
    [228690, 0, "unpaid"],
    [228690, 100, "unpaid"],
    [228690, 228690, "paid"],
    [192390, 228690, "refund_due"],
    [0, 0, "not_applicable"],
    [0, 36300, "refund_due"], // every platform part cancelled after payment: the buyer is still owed money
  ] as const)("due %i, paid %i → %s", (due, paid, expected) => {
    expect(paymentStatus(due, paid)).toBe(expected);
  });

  it("rejects negative or fractional amounts", () => {
    expect(() => paymentStatus(-1, 0)).toThrow(RangeError);
    expect(() => paymentStatus(100, 0.5)).toThrow(RangeError);
  });
});

describe("ledger functions reject bad input", () => {
  it("commission above gross", () => {
    expect(() =>
      checkoutLedgerEntries({
        mode: "platform",
        grossCents: 100,
        commissionCents: 101,
      }),
    ).toThrow(RangeError);
  });
  it("a fractional ledger amount", () => {
    expect(() => ledgerBalance([{ amountCents: 1.5 }])).toThrow(RangeError);
  });
});

describe("ledger properties", () => {
  const modeArb = fc.constantFrom<PurchaseMode>("direct", "platform");
  const subOrderArb = fc
    .record({
      lines: fc.array(lineArb, { minLength: 1, maxLength: 10 }),
      bps: commissionBps,
      mode: modeArb,
    })
    .map(({ lines, bps, mode }) => {
      const totals = sumAmounts(lines.map(lineAmounts));
      return {
        mode,
        grossCents: totals.grossCents,
        commissionCents: commissionCents(totals.netCents, bps),
      };
    })
    .filter((s) => s.grossCents > 0);

  it("platform: the entries leave the supplier gross − commission (= payable)", () => {
    fc.assert(
      fc.property(subOrderArb, (s) => {
        fc.pre(s.mode === "platform");
        return (
          ledgerBalance(checkoutLedgerEntries(s)) ===
          payableCents(s.grossCents, s.commissionCents)
        );
      }),
    );
  });

  it("direct: the entries sum to −commission (a negative balance is allowed)", () => {
    fc.assert(
      fc.property(subOrderArb, (s) => {
        fc.pre(s.mode === "direct");
        return ledgerBalance(checkoutLedgerEntries(s)) === -s.commissionCents;
      }),
    );
  });

  it("a cancelled sub-order's entries sum to 0, in both modes", () => {
    fc.assert(
      fc.property(
        subOrderArb,
        (s) =>
          ledgerBalance([
            ...checkoutLedgerEntries(s),
            ...cancellationLedgerEntries(s),
          ]) === 0,
      ),
    );
  });

  it("every entry obeys the database sign rule, and direct never books a sale", () => {
    fc.assert(
      fc.property(subOrderArb, (s) => {
        const all = [
          ...checkoutLedgerEntries(s),
          ...cancellationLedgerEntries(s),
        ];
        const signsOk = all.every(
          (e) =>
            (e.type === "sale" && e.amountCents > 0) ||
            (e.type === "sale_reversal" && e.amountCents < 0) ||
            (e.type === "commission" && e.amountCents <= 0) ||
            (e.type === "commission_reversal" && e.amountCents >= 0),
        );
        const noDirectSale =
          s.mode === "platform" ||
          all.every((e) => e.type !== "sale" && e.type !== "sale_reversal");
        return signsOk && noDirectSale;
      }),
    );
  });

  it("ledger balance does not depend on the order of the entries", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), {
          maxLength: 30,
        }),
        (amounts) => {
          const entries = amounts.map((amountCents) => ({ amountCents }));
          return (
            ledgerBalance(entries) === ledgerBalance([...entries].reverse())
          );
        },
      ),
    );
  });

  it("amount due counts only non-cancelled platform sub-orders; the status follows the rule", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            mode: modeArb,
            cancelled: fc.boolean(),
            grossCents: fc.integer({ min: 0, max: 5_000_000 }),
          }),
          { maxLength: 6 },
        ),
        fc.integer({ min: 0, max: 20_000_000 }),
        (subs, paid) => {
          const expected = subs
            .filter((s) => s.mode === "platform" && !s.cancelled)
            .reduce((sum, s) => sum + s.grossCents, 0);
          const due = amountDueCents(subs);
          const expectedStatus =
            paid > due
              ? "refund_due"
              : due === 0
                ? "not_applicable"
                : paid === due
                  ? "paid"
                  : "unpaid";
          return (
            due === expected && paymentStatus(due, paid) === expectedStatus
          );
        },
      ),
    );
  });
});
