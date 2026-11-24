"""Reference implementation of the money rules (money-rules.md) — integers only, no floats.
Generates money-vectors.json (unit-test vectors for src/server/domain/money.ts) and asserts every
number quoted in money-rules.md. Run: python3 tools/money_vectors.py
"""
import json, sys

def half_up_div(numerator: int, denominator: int) -> int:
    """round(numerator / denominator), ties away from zero (= half-up for our non-negative amounts)."""
    assert denominator > 0
    if numerator >= 0:
        return (2 * numerator + denominator) // (2 * denominator)
    return -half_up_div(-numerator, denominator)

def half_even_div(numerator: int, denominator: int) -> int:  # only to show the difference in E2
    q, r = divmod(numerator, denominator)
    if 2 * r > denominator or (2 * r == denominator and q % 2 == 1):
        q += 1
    return q

def line(unit_cents: int, qty: int, vat_bps: int):
    net = unit_cents * qty
    vat = half_up_div(net * vat_bps, 10_000)
    return {"unit_price_cents": unit_cents, "quantity": qty, "vat_rate_bps": vat_bps,
            "line_net_cents": net, "line_vat_cents": vat, "line_gross_cents": net + vat}

def sub_order(lines, commission_bps):
    net = sum(l["line_net_cents"] for l in lines); vat = sum(l["line_vat_cents"] for l in lines)
    commission = half_up_div(net * commission_bps, 10_000)
    breakdown = {}
    for l in lines:
        b = breakdown.setdefault(l["vat_rate_bps"], {"rate_bps": l["vat_rate_bps"], "net_cents": 0, "vat_cents": 0})
        b["net_cents"] += l["line_net_cents"]; b["vat_cents"] += l["line_vat_cents"]
    gross = net + vat
    return {"lines": lines, "net_cents": net, "vat_cents": vat, "gross_cents": gross,
            "commission_bps": commission_bps, "commission_cents": commission,
            "payable_cents": gross - commission, "vat_breakdown": sorted(breakdown.values(), key=lambda b: -b["rate_bps"])}

def order(subs):
    return {"net_cents": sum(s["net_cents"] for s in subs), "vat_cents": sum(s["vat_cents"] for s in subs),
            "gross_cents": sum(s["gross_cents"] for s in subs)}

def payment_status(paid: int, due: int) -> str:
    if paid > due: return "refund_due"
    if paid == due and due > 0: return "paid"
    return "unpaid"

V = {}

# E1 — one line
e1 = line(48_900, 2, 2100)
assert (e1["line_net_cents"], e1["line_vat_cents"], e1["line_gross_cents"]) == (97_800, 20_538, 118_338)
V["E1_single_line"] = e1

# E2 — half-up at an exact .5 (0.25 × 2 = 0.50 net; VAT = 10.5 cents)
e2 = line(25, 2, 2100)
assert e2["line_vat_cents"] == 11 and half_even_div(50 * 2100, 10_000) == 10
V["E2_half_up_tie"] = {**e2, "note": "50 × 2100 / 10000 = 10.5 → 11 (half-up); half-even would give 10"}

# E3 — per-line rounding vs rounding the total (rule: per line)
e3_lines = [line(50, 1, 2100), line(50, 1, 2100)]
e3 = sub_order(e3_lines, 800)
assert [l["line_vat_cents"] for l in e3_lines] == [11, 11] and e3["vat_cents"] == 22
assert half_up_div(100 * 2100, 10_000) == 21  # what "round the total" would have given
V["E3_round_per_line"] = {**e3, "note": "Σ rounded lines = 22; rounding the sum (100 × 21 %) would be 21 — we use 22"}

# E4 — mixed VAT rates in one sub-order (21 % + 7 %; rates: verify)
e4 = sub_order([line(61_200, 1, 2100), line(1_350, 4, 700)], 800)
assert (e4["net_cents"], e4["vat_cents"], e4["gross_cents"]) == (66_600, 13_230, 79_830)
assert e4["vat_breakdown"] == [{"rate_bps": 2100, "net_cents": 61_200, "vat_cents": 12_852},
                               {"rate_bps": 700, "net_cents": 5_400, "vat_cents": 378}]
assert e4["commission_cents"] == 5_328
V["E4_mixed_vat"] = e4

# E5 — three-supplier cart (the checkout wireframe): A default 8 %, B default 8 %, C override 6.5 %
A = sub_order([line(48_900, 2, 2100), line(61_200, 1, 2100)], 800)
B = sub_order([line(750, 40, 2100)], 800)
C = sub_order([line(1_920, 5, 2100)], 650)
O = order([A, B, C])
assert (A["net_cents"], A["vat_cents"], A["gross_cents"], A["commission_cents"]) == (159_000, 33_390, 192_390, 12_720)
assert (B["net_cents"], B["vat_cents"], B["gross_cents"], B["commission_cents"]) == (30_000, 6_300, 36_300, 2_400)
assert (C["net_cents"], C["vat_cents"], C["gross_cents"], C["commission_cents"]) == (9_600, 2_016, 11_616, 624)
assert (O["net_cents"], O["vat_cents"], O["gross_cents"]) == (198_600, 41_706, 240_306)
ledger5 = []
for name, s in (("A", A), ("B", B), ("C", C)):
    ledger5 += [{"supplier": name, "type": "sale", "amount_cents": s["gross_cents"]},
                {"supplier": name, "type": "commission", "amount_cents": -s["commission_cents"]}]
bal5 = {n: sum(e["amount_cents"] for e in ledger5 if e["supplier"] == n) for n in "ABC"}
assert bal5 == {"A": 179_670, "B": 33_900, "C": 10_992}
for s in (A, B, C):
    assert s["payable_cents"] + s["commission_cents"] == s["gross_cents"]
V["E5_three_supplier_checkout"] = {"sub_orders": {"A": A, "B": B, "C": C}, "order": O,
                                   "ledger_at_checkout": ledger5, "balances_cents": bal5,
                                   "platform_commission_cents": 12_720 + 2_400 + 624}

# E6 — commission rounding (once per sub-order, half-up)
e6a = half_up_div(100 * 650, 10_000)          # 6.5 → 7
e6b = half_up_div(123_457 * 650, 10_000)      # 8024.705 → 8025
e6c = half_up_div(99 * 800, 10_000)           # 7.92 → 8
assert (e6a, e6b, e6c) == (7, 8_025, 8)
V["E6_commission_rounding"] = [
    {"net_cents": 100, "commission_bps": 650, "commission_cents": 7, "note": "6.5 → 7 (half-up)"},
    {"net_cents": 123_457, "commission_bps": 650, "commission_cents": 8_025, "note": "8024.705 → 8025"},
    {"net_cents": 99, "commission_bps": 800, "commission_cents": 8, "note": "7.92 → 8"},
]

# E7 — cancellation after checkout: B cancelled → mirrored reversals; amount due and pro-forma v2
ledger7 = ledger5 + [{"supplier": "B", "type": "sale_reversal", "amount_cents": -B["gross_cents"]},
                     {"supplier": "B", "type": "commission_reversal", "amount_cents": B["commission_cents"]}]
bal7 = {n: sum(e["amount_cents"] for e in ledger7 if e["supplier"] == n) for n in "ABC"}
assert bal7 == {"A": 179_670, "B": 0, "C": 10_992}
due7 = A["gross_cents"] + C["gross_cents"]
assert due7 == 204_006
pf_v2 = order([A, C])
assert (pf_v2["net_cents"], pf_v2["vat_cents"], pf_v2["gross_cents"]) == (168_600, 35_406, 204_006)
V["E7_cancellation_reversal"] = {"cancelled": "B", "new_entries": ledger7[-2:], "balances_cents": bal7,
                                 "order_totals_unchanged": O, "amount_due_cents": due7, "proforma_v2": pf_v2}

# E8 — payment status: buyer paid v1 in full before B was cancelled → refund_due → refund → paid
paid = O["gross_cents"]
assert payment_status(0, O["gross_cents"]) == "unpaid"
assert payment_status(paid, O["gross_cents"]) == "paid"
assert payment_status(paid, due7) == "refund_due" and paid - due7 == 36_300
assert payment_status(paid - 36_300, due7) == "paid"
assert payment_status(0, 0) == "unpaid"          # everything cancelled, nothing paid
V["E8_payment_status"] = [
    {"step": "checkout", "paid_cents": 0, "due_cents": 240_306, "status": "unpaid"},
    {"step": "receipt 2,403.06", "paid_cents": 240_306, "due_cents": 240_306, "status": "paid"},
    {"step": "B cancelled", "paid_cents": 240_306, "due_cents": 204_006, "status": "refund_due"},
    {"step": "refund 363.00", "paid_cents": 204_006, "due_cents": 204_006, "status": "paid"},
    {"step": "all cancelled, nothing paid", "paid_cents": 0, "due_cents": 0, "status": "unpaid"},
]

# E9 — supplier balance split + payout (A delivered & order paid, C still pending)
earned_A = A["gross_cents"] - A["commission_cents"]           # delivered → earned
pending_C = C["gross_cents"] - C["commission_cents"]          # not delivered yet → pending
payout_A = -earned_A
assert (earned_A, pending_C) == (179_670, 10_992)
assert earned_A + payout_A == 0
V["E9_balance_split_and_payout"] = {
    "A": {"earned_cents": earned_A, "pending_cents": 0, "payout_cents": payout_A, "balance_after_payout_cents": 0},
    "C": {"earned_cents": 0, "pending_cents": pending_C, "balance_cents": pending_C}}

# E10 — quantity rules (min order quantity + order step)
def qty_ok(q, mn, step): return q >= mn and q % step == 0
assert qty_ok(12, 6, 6) and not qty_ok(10, 6, 6) and not qty_ok(3, 6, 6) and qty_ok(40, 1, 1)
V["E10_quantity_rules"] = [{"quantity": q, "min_order_qty": 6, "order_step": 6, "valid": qty_ok(q, 6, 6)} for q in (3, 6, 10, 12)]

json.dump(V, open(sys.argv[1] if len(sys.argv) > 1 else "money-vectors.json", "w"), indent=2)
print("money vectors OK:", ", ".join(V))
