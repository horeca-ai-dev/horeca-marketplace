"""Wireframes v4 — 4 screens following DESIGN.md (tokens, components, copy) and decisions 9–11.
Every amount is computed with the money rules (money-rules.md: half-up, VAT per line, commission once per
sub-order on net, payable = gross − commission) and asserted, so the four screens agree with each other and with
money-vectors.json (example E5 = the checkout screen).
Usage: python3 wireframes_v4.py <out_dir> <money-vectors.json>
"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
VEC = json.load(open(sys.argv[2]))

# ───────── money rules (integers only) ─────────
def rdiv(n, d): return (2 * n + d) // (2 * d)
def line(unit, qty, vat=2100):
    net = unit * qty; v = rdiv(net * vat, 10000); return dict(unit=unit, qty=qty, vat_bps=vat, net=net, vat=v, gross=net + v)
def sub(lines, bps):
    net = sum(l["net"] for l in lines); vat = sum(l["vat"] for l in lines); c = rdiv(net * bps, 10000)
    return dict(net=net, vat=vat, gross=net + vat, bps=bps, commission=c, payable=net + vat - c)
def eur(cents):  # DESIGN.md: 1.234,56 €
    s = f"{abs(cents) // 100:,}".replace(",", "."); return f"{'−' if cents < 0 else ''}{s},{abs(cents) % 100:02d} €"
def pct(bps): return f"{bps / 100:.1f}".replace(".", ",") + " %"

# ───────── W2 checkout = money example E5 ─────────
CART = {
    "Gastro Oprema d.o.o.": (800, [("Podpultni frižider 150 l, inox", "RF-150", 48900, 2, "piece"),
                                   ("Radni sto inox 1500 mm", "PT-1500", 61200, 1, "piece")]),
    "Stolni Servis d.o.o.": (800, [("Čaša za vodu 33 cl", "GL-33", 750, 40, "piece")]),
    "Hotel Tekstil d.o.o.": (650, [("Salveta 40×40 bijela (pak. 50)", "NP-4040", 1920, 5, "pack")]),
}
checkout = {s: sub([line(u, q) for _, _, u, q, _ in items], bps) for s, (bps, items) in CART.items()}
e5 = VEC["E5_three_supplier_checkout"]
for key, s in zip("ABC", checkout.values()):
    v = e5["sub_orders"][key]
    assert (s["net"], s["vat"], s["gross"], s["commission"]) == (v["net_cents"], v["vat_cents"], v["gross_cents"], v["commission_cents"])
order_net = sum(s["net"] for s in checkout.values()); order_vat = sum(s["vat"] for s in checkout.values())
assert (order_net, order_vat, order_net + order_vat) == (e5["order"]["net_cents"], e5["order"]["vat_cents"], e5["order"]["gross_cents"])

# ───────── shared dataset for W3 (supplier A) and W4 (admin) ─────────
# (sub-order, buyer, supplier, net cents, status, order paid?)
SUBS = [
    ("ORD-2026-000123-1", "Hotel Main", "A", 159000, "pending", False),
    ("ORD-2026-000127-1", "Hotel Splendid", "A", 87450, "confirmed", True),
    ("ORD-2026-000131-1", "Cafe Luna", "A", 64000, "shipped", False),
    ("ORD-2026-000118-1", "Hotel Adria", "A", 215000, "delivered", True),
    ("ORD-2026-000104-1", "Konoba Mare", "A", 96000, "delivered", False),
    ("ORD-2026-000109-1", "Bar Nord", "A", 30000, "cancelled", False),
    ("ORD-2026-000123-2", "Hotel Main", "B", 30000, "pending", False),
    ("ORD-2026-000112-1", "Hotel Splendid", "B", 387000, "delivered", True),
    ("ORD-2026-000123-3", "Hotel Main", "C", 9600, "pending", False),
    ("ORD-2026-000110-1", "Restoran Luka", "C", 293000, "delivered", True),
    ("ORD-2026-000121-1", "Bar Nord", "C", 200000, "delivered", False),
]
RATE = {"A": 800, "B": 800, "C": 650}
NAME = {"A": "Gastro Oprema d.o.o.", "B": "Stolni Servis d.o.o.", "C": "Hotel Tekstil d.o.o."}
def money_of(net, s): return sub([dict(net=net, vat=rdiv(net * 2100, 10000), gross=0)], RATE[s])
PAYOUTS = {"B": [("ORD-2026-000112-1", "NAL-2026-0041")]}  # B's delivered + paid sub-order already paid out

def supplier_figures(s):
    rows = [r for r in SUBS if r[2] == s]
    f = dict(sales_net=0, commission=0, commission_earned=0, pending=0, earned=0, ready=0, paid_out=0, ledger=[])
    for no, buyer, _, net, status, paid in rows:
        m = money_of(net, s)
        f["ledger"] += [(no, "sale", m["gross"]), (no, "commission", -m["commission"])]
        if status == "cancelled":
            f["ledger"] += [(no, "sale_reversal", -m["gross"]), (no, "commission_reversal", m["commission"])]
            continue
        f["sales_net"] += net; f["commission"] += m["commission"]
        if status == "delivered":
            f["earned"] += m["payable"]; f["commission_earned"] += m["commission"]
            if paid: f["ready"] += m["payable"]
        else:
            f["pending"] += m["payable"]
    for no, ref in PAYOUTS.get(s, []):
        net = next(r[3] for r in SUBS if r[0] == no); amount = money_of(net, s)["payable"]
        f["ledger"].append((ref, "payout", -amount)); f["paid_out"] += amount; f["ready"] -= amount
    f["balance"] = sum(a for _, _, a in f["ledger"])
    assert f["balance"] == f["pending"] + f["earned"] - f["paid_out"]          # money-rules §4
    return f

FIG = {s: supplier_figures(s) for s in "ABC"}
A = FIG["A"]
# hand-check of supplier A (8 %): payable = gross − commission
assert money_of(159000, "A")["payable"] == 192390 - 12720 == 179670
assert A["pending"] == 179670 + (105815 - 6996) + (77440 - 5120)
assert A["earned"] == (260150 - 17200) + (116160 - 7680)
assert A["ready"] == 260150 - 17200                     # delivered + paid: ORD-…118-1 only
assert A["balance"] == A["pending"] + A["earned"]        # no payout for A yet; Bar Nord cancelled sums to 0
TOTAL = {k: sum(FIG[s][k] for s in "ABC") for k in ("sales_net", "commission", "commission_earned", "balance", "ready", "paid_out")}
ORDERS_30D = len({r[0].rsplit("-", 1)[0] for r in SUBS})
assert ORDERS_30D == 9

def order_due(order_no):
    rows = [r for r in SUBS if r[0].startswith(order_no + "-") and r[4] != "cancelled"]
    return sum(money_of(r[3], r[2])["gross"] for r in rows), all(r[5] for r in rows)
UNPAID = [(o, b, m) for o, b, m in [("ORD-2026-000123", "Hotel Main", "Pro-forma · due 26.11.2026"),
                                    ("ORD-2026-000104", "Konoba Mare", "Bank transfer · due 08.12.2026"),
                                    ("ORD-2026-000121", "Bar Nord", "Bank transfer · due 05.12.2026"),
                                    ("ORD-2026-000131", "Cafe Luna", "Pro-forma · due 25.11.2026")]]
assert order_due("ORD-2026-000123")[0] == order_net + order_vat == 240306

# ───────── HTML ─────────
CSS = """
*{box-sizing:border-box} body{margin:0;font-family:Inter,system-ui,Arial;color:#1F2937;font-size:14px;background:#fff}
.frame{width:1280px;border:1px solid #D9DDE3;background:#fff}
.hdr{display:flex;align-items:center;gap:14px;padding:10px 20px;border-bottom:1px solid #D9DDE3;height:60px}
.logo{font-weight:700;font-size:17px;color:#2B579A;white-space:nowrap}
.search{flex:1;border:1px solid #D9DDE3;border-radius:6px;padding:8px 12px;color:#5B6472}
.org{display:flex;align-items:center;gap:6px;border-radius:6px;padding:6px 10px;color:#fff;font-weight:600;font-size:13px;white-space:nowrap}
.hlink{color:#2B579A;font-weight:600;white-space:nowrap}
.side{width:210px;background:#F5F6F8;border-right:1px solid #D9DDE3;padding:16px 12px}
.side a{display:block;padding:7px 10px;border-radius:6px;color:#1F2937;margin-bottom:2px}
.side a.on{background:#DCE6F5;color:#2B579A;font-weight:600}
.wrap{padding:20px 22px}
h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:0 0 10px} .muted{color:#5B6472} .small{font-size:12px}
.card{border:1px solid #D9DDE3;border-radius:10px;padding:14px 16px;background:#fff}
.btn{display:inline-block;border-radius:6px;padding:7px 12px;font-weight:600;font-size:13px;border:1px solid #2B579A;color:#2B579A;background:#fff;white-space:nowrap}
.btn.p{background:#2B579A;color:#fff} .btn.d{border-color:#B3261E;color:#B3261E} .btn.g{border-color:#D9DDE3;color:#5B6472}
.badge{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:600;white-space:nowrap}
.pending{background:#FFF1D6;color:#8A5A00} .confirmed{background:#DCE6F5;color:#2B579A} .shipped{background:#ECE6F8;color:#5B3FA0}
.delivered{background:#E3F4EA;color:#1E7A4C} .cancelled{background:#FBE3E0;color:#B3261E}
.unpaid{background:#FFF1D6;color:#8A5A00} .paid{background:#E3F4EA;color:#1E7A4C}
table{border-collapse:collapse;width:100%} th{background:#DCE6F5;text-align:left;font-size:12.5px;padding:8px 9px;color:#1F2937}
td{padding:8px 9px;border-bottom:1px solid #EEF0F3;vertical-align:top} .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.b{font-weight:700} .kpi{flex:1} .kpi .v{font-size:24px;font-weight:700;color:#2B579A;font-variant-numeric:tabular-nums} .kpi .l{color:#5B6472;font-size:12.5px;margin-top:2px}
.chip{display:inline-block;background:#DCE6F5;color:#2B579A;border-radius:999px;padding:3px 10px;font-size:12px;margin-right:6px}
.note{font-size:12px;color:#5B6472;margin-top:8px;line-height:1.45}
.prop{border:1.5px dashed #6B3FA0;background:#FBF8FE} .proptag{color:#6B3FA0;font-size:11.5px;font-weight:700}
.img{background:#E9EDF3;border-radius:8px;height:126px;display:flex;align-items:center;justify-content:center;color:#8A94A3;font-size:12px}
.facet{display:flex;justify-content:space-between;padding:3px 0} .cnt{color:#5B6472;font-size:12px}
"""
def header(org_label, org_colour, extra=""):
    return (f"<div class='hdr'><div class='logo'>HoReCa Marketplace</div><div class='search'>🔍 Search products…</div>{extra}"
            f"<div class='org' style='background:{org_colour}'>{org_label} ▾</div><div class='hlink'>Account ▾</div></div>")
def page(title, body, w=1280):
    return f"<html><head><meta charset='utf-8'><style>{CSS}</style></head><body><div class='frame' style='width:{w}px'>{body}</div><div style='font:12px Inter;color:#888;padding:6px 2px'>{title}</div></body></html>"

# W1 — catalogue (buyer)
PRODUCTS = [  # display coolers; two share GTIN 3830012345671
    ("Frižider vitrina 400 l, staklena vrata", "A", 121000, "400 l · 4 shelves · class C", True),
    ("Frižider vitrina 400 l, staklena vrata", "B", 114900, "400 l · 4 shelves · class C", True),
    ("Frižider vitrina 250 l, LED", "A", 79900, "250 l · 3 shelves · class B", False),
    ("Frižider vitrina 600 l, 2 vrata", "A", 168000, "600 l · 5 shelves · class D", False),
    ("Mini frižider vitrina za piće 90 l", "B", 39900, "90 l · 2 shelves · class B", False),
]
assert sum(1 for p in PRODUCTS if p[1] == "A") == 3 and len(PRODUCTS) == 5
def w1():
    cards = ""
    for name, s, price, attrs, shared in PRODUCTS:
        cards += (f"<div class='card' style='padding:10px'><div class='img'>image 4:3</div>"
                  f"<div style='font-weight:600;margin:8px 0 2px;height:38px;overflow:hidden'>{name}</div>"
                  f"<div class='muted small'>{NAME[s]}</div><div class='small' style='margin:4px 0'>{attrs}</div>"
                  + (f"<div class='small' style='color:#0F766E;margin-bottom:4px'>⇄ Also offered by 1 other supplier (same GTIN)</div>" if shared else "<div style='height:19px'></div>")
                  + f"<div style='display:flex;justify-content:space-between;align-items:end;margin-top:4px'><div><span class='b' style='font-size:16px'>{eur(price)}</span>"
                  f"<div class='muted small'>excl. VAT · per piece</div></div><span class='btn p'>Add to cart</span></div>"
                  f"<div class='small muted' style='margin-top:6px'>☐ Compare</div></div>")
    side = """<div style='width:250px;padding-right:18px'>
      <h2>Filters</h2>
      <div class='b small' style='margin:8px 0 4px'>Category</div>
      <div class='small muted'>Refrigeration</div>
      <div class='facet small' style='padding-left:10px'><span>Under-counter fridges</span><span class='cnt'>12</span></div>
      <div class='facet small' style='padding-left:10px'><span>Freezers</span><span class='cnt'>3</span></div>
      <div class='facet small b' style='padding-left:10px;color:#2B579A'><span>● Display coolers</span><span class='cnt'>5</span></div>
      <div class='b small' style='margin:12px 0 4px'>Price (net, €)</div><div class='small'>[ 300 ] – [ 2.000 ]</div>
      <div class='b small' style='margin:12px 0 4px'>Supplier</div>
      <div class='facet small'><span>☑ Gastro Oprema d.o.o.</span><span class='cnt'>3</span></div>
      <div class='facet small'><span>☑ Stolni Servis d.o.o.</span><span class='cnt'>2</span></div>
      <div class='b small' style='margin:12px 0 4px'>Capacity (l)</div><div class='small'>[ 50 ] – [ 800 ]</div>
      <div class='b small' style='margin:12px 0 4px'>Shelves</div><div class='small'>[ 1 ] – [ 10 ]</div>
      <div class='b small' style='margin:12px 0 4px'>Energy class</div>
      <div class='facet small'><span>☐ B</span><span class='cnt'>2</span></div><div class='facet small'><span>☐ C</span><span class='cnt'>2</span></div><div class='facet small'><span>☐ D</span><span class='cnt'>1</span></div>
      <div class='note'>Attribute filters are generated from the category's attribute definitions (inherited from Refrigeration + own). Facet counts from Meilisearch.</div>
      <div style='margin-top:10px'><span class='btn g'>Reset</span></div></div>"""
    body = header("🛒 Buyer · Hotel Main d.o.o.", "#2B579A", "<div class='hlink'>Cart (4)</div>") + f"""
    <div class='wrap'><div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>
      <div><h1>Display coolers</h1><div class='muted'>5 results for <b>“frizider”</b> — typo- and diacritics-tolerant · only active products of approved suppliers</div>
      <div style='margin-top:8px'><span class='chip'>Display coolers ✕</span><span class='chip'>q: frizider ✕</span></div></div>
      <span class='btn g'>Sort: Relevance ▾</span></div>
      <div style='display:flex'>{side}<div style='flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:14px'>{cards}</div></div>
      <div class='note' style='text-align:right'>Page 1 of 1 · all filters live in the URL (?q=frizider&amp;category=display-coolers&amp;supplier=…)</div></div>"""
    return page("W1 — Catalogue (buyer) · DESIGN.md Catalogue layout · decision 10.8", body)

# W2 — cart & checkout (buyer)
def w2():
    groups = ""
    for (sname, (bps, items)), s in zip(CART.items(), checkout.values()):
        rows = "".join(f"<tr><td>{n}<div class='muted small'>SKU {sku}</div></td><td class='r'>{eur(u)}</td>"
                       f"<td class='r'>[ {q} ] {unit}</td><td class='r'>{eur(u * q)}</td></tr>" for n, sku, u, q, unit in items)
        groups += (f"<div class='card' style='padding:0;margin-bottom:12px;overflow:hidden'><div style='background:#DCE6F5;padding:9px 12px;display:flex;justify-content:space-between'>"
                   f"<b>{sname}</b><span class='muted small'>becomes 1 sub-order</span></div><table style='table-layout:fixed'><colgroup><col style='width:46%'><col style='width:20%'><col style='width:16%'><col style='width:18%'></colgroup><tr><th>Product</th><th class='r'>Unit price (net)</th><th class='r'>Qty</th><th class='r'>Net</th></tr>{rows}"
                   f"<tr><td colspan='3' class='r muted small'>Sub-total net · VAT 21 % · gross</td><td class='r b'>{eur(s['net'])}<div class='muted small'>{eur(s['vat'])} · {eur(s['gross'])}</div></td></tr></table></div>")
    body = header("🛒 Buyer · Hotel Main d.o.o.", "#2B579A", "<div class='hlink'>Cart (4)</div>") + f"""
    <div class='wrap'><h1>Cart &amp; checkout</h1><div class='muted' style='margin-bottom:14px'>Shared by all members of Hotel Main d.o.o. · prices excl. VAT</div>
    <div style='display:flex;gap:20px;align-items:flex-start'><div style='flex:1'>{groups}
      <div class='card' style='background:#FFF1D6;border-color:#E8C77A'><b>⚠ If something changed since you added it</b><div class='small'>Checkout re-validates every line inside the order transaction (price, availability, minimum quantity). Changed lines are listed here and you confirm again — nothing is ordered until then.</div></div></div>
    <div class='card' style='width:360px;background:#F5F6F8'><h2>Order summary</h2>
      <div class='small b'>Delivery location</div><div class='btn g' style='display:block;margin:4px 0 12px'>Hotel Main — Obala 1, 85310 Budva ▾</div>
      <div class='small b'>Payment method</div>
      <div style='margin:6px 0 12px;line-height:1.9'>(•) Pro-forma invoice <span class='muted small'>(default)</span><br>( ) Bank transfer after delivery<br><span class='muted'>( ) Card — stretch, not available</span></div>
      <table><tr><td>Net</td><td class='r'>{eur(order_net)}</td></tr><tr><td>VAT 21 %</td><td class='r'>{eur(order_vat)}</td></tr>
      <tr><td class='b'>Total</td><td class='r b' style='font-size:17px'>{eur(order_net + order_vat)}</td></tr></table>
      <div class='btn p' style='display:block;text-align:center;padding:12px;margin-top:12px;font-size:15px'>Place order (3 sub-orders)</div>
      <div class='note'>You receive <b>one</b> pro-forma invoice from the platform (PF-2026-…) for the whole order and pay once; each supplier confirms and ships its part independently. With several VAT rates the summary shows one VAT line per rate.</div></div></div></div>"""
    return page("W2 — Cart & checkout (buyer) · money example E5 · decisions 11.1, 11.7, 11.8", body)

# W3 — supplier dashboard (supplier A, owner)
ACTIONS = {"pending": "<span class='btn p'>Confirm</span> <span class='btn d'>Cancel…</span>", "confirmed": "<span class='btn p'>Ship</span> <span class='btn d'>Cancel…</span>",
           "shipped": "<span class='btn p'>Mark delivered</span>", "delivered": "<span class='muted small'>—</span>", "cancelled": "<span class='muted small'>—</span>"}
def w3():
    rows = ""
    for no, buyer, s, net, status, paid in SUBS:
        if s != "A": continue
        pay = "<span class='muted small'>—</span>" if status == "cancelled" else f"<span class='badge {'paid' if paid else 'unpaid'}'>{'Paid' if paid else 'Unpaid'}</span>"
        rows += (f"<tr><td><b>{no}</b><div class='muted small'>{buyer}</div></td><td class='r'>{eur(net)}</td>"
                 f"<td><span class='badge {status}'>● {status.capitalize()}</span></td><td>{pay}</td><td class='r'>{ACTIONS[status]}</td></tr>")
    recent = [e for e in A["ledger"] if e[0] in ("ORD-2026-000109-1", "ORD-2026-000123-1")]
    led = "".join(f"<tr><td class='small'>{no}</td><td class='small'>{t.replace('_', ' ')}</td><td class='r small'>{eur(a)}</td></tr>" for no, t, a in recent)
    body = header("🏭 Supplier · Gastro Oprema d.o.o.", "#0F766E") + f"""
    <div style='display:flex'><div class='side'><a class='on'>Dashboard</a><a>My products</a><a>CSV import</a><a>Sub-orders</a><a>Ledger</a><a>Company &amp; bank details</a></div>
    <div class='wrap' style='flex:1'><h1>Dashboard</h1><div class='muted' style='margin-bottom:14px'>Owner view · you see only your own sub-orders</div>
    <div style='display:flex;gap:18px;align-items:flex-start'>
     <div style='flex:1.45'><div class='card' style='padding:0;overflow:hidden'><div style='padding:10px 12px'><h2 style='margin:0'>Sub-orders</h2></div>
       <table><tr><th>Sub-order / buyer</th><th class='r'>Net</th><th>Status</th><th>Order paid</th><th class='r'>Actions (legal only)</th></tr>{rows}</table></div>
       <div class='note'>Buttons come from the state machine: pending → Confirm/Cancel · confirmed → Ship/Cancel · shipped → Mark delivered. Payment status is informational in the MVP (open question Q3).</div>
       <div class='card' style='margin-top:14px'><h2>CSV import — under_counter_bad_rows.csv</h2>
         <div style='display:flex;gap:16px;margin-bottom:8px'><div><b>20</b> <span class='muted small'>rows</span></div><div style='color:#1E7A4C'><b>12</b> <span class='small'>valid</span></div><div style='color:#B3261E'><b>8</b> <span class='small'>invalid</span></div></div>
         <table><tr><th>Row</th><th>Column</th><th>Message</th></tr>
         <tr><td>3</td><td>base_price</td><td>Price must be a positive number</td></tr><tr><td>5</td><td>capacity_l</td><td>capacity_l must be a number (l)</td></tr>
         <tr><td>9</td><td>door_type</td><td>door_type must be one of: solid, glass</td></tr><tr><td>13</td><td>sku</td><td>Duplicate SKU in file (row 2)</td></tr></table>
         <div style='display:flex;justify-content:space-between;margin-top:10px'><span class='btn g'>Download error CSV (8 rows)</span><span><span class='btn g'>Cancel</span> <span class='btn p'>Import 12 valid rows</span></span></div></div></div>
     <div style='flex:1'><div class='card'><h2>Ledger — what the platform owes you</h2>
       <table><tr><td>Balance</td><td class='r b' style='font-size:17px'>{eur(A['balance'])}</td></tr>
       <tr><td class='small'>of which earned (delivered)</td><td class='r'>{eur(A['earned'])}</td></tr>
       <tr><td class='small'>of which pending (not yet delivered)</td><td class='r'>{eur(A['pending'])}</td></tr>
       <tr><td class='small b' style='color:#1E7A4C'>Ready for payout (delivered + paid)</td><td class='r b' style='color:#1E7A4C'>{eur(A['ready'])}</td></tr>
       <tr><td class='small'>Platform commission 8,0 % on net (non-cancelled)</td><td class='r'>{eur(A['commission'])}</td></tr></table>
       <div class='b small' style='margin-top:12px'>Recent entries</div><table>{led}</table>
       <div class='note'>+ = the platform owes you more. Checkout books sale (+gross) and commission (−); a cancellation books both reversals, so a cancelled sub-order sums to 0 (Bar Nord).</div></div></div>
    </div></div></div>"""
    return page("W3 — Supplier dashboard (supplier A, owner) · decisions 10.7, 11.5, 11.6", body)

# W4 — admin commission & ledgers
def w4():
    rows = ""
    for s in "ABC":
        f = FIG[s]
        rows += (f"<tr><td><b>{NAME[s]}</b></td><td class='r'>{eur(f['sales_net'])}</td><td class='r'>{pct(RATE[s])}{' <span class=\"muted small\">override</span>' if RATE[s] != 800 else ''}</td>"
                 f"<td class='r'>{eur(f['commission'])}</td><td class='r'>{eur(f['commission_earned'])}</td><td class='r'>{eur(f['paid_out'])}</td>"
                 f"<td class='r b'>{eur(f['balance'])}</td><td class='r'>{eur(f['ready'])}</td></tr>")
    rows += (f"<tr><td class='b'>Total</td><td class='r b'>{eur(TOTAL['sales_net'])}</td><td></td><td class='r b'>{eur(TOTAL['commission'])}</td>"
             f"<td class='r b'>{eur(TOTAL['commission_earned'])}</td><td class='r b'>{eur(TOTAL['paid_out'])}</td><td class='r b'>{eur(TOTAL['balance'])}</td><td class='r b'>{eur(TOTAL['ready'])}</td></tr>")
    unpaid = "".join(f"<tr><td><b>{o}</b><div class='muted small'>{b} · {m}</div></td><td class='r'>{eur(order_due(o)[0])}</td>"
                     f"<td><span class='badge unpaid'>Unpaid</span></td><td class='r'><span class='btn p'>Record payment</span></td></tr>" for o, b, m in UNPAID)
    body = header("🛡 Platform admin", "#374151") + f"""
    <div style='display:flex'><div class='side'><a>Overview</a><a>Supplier approval</a><a>Categories &amp; attributes</a><a class='on'>Commission &amp; ledgers</a><a>All orders</a><a>Audit log</a><a>Jobs</a></div>
    <div class='wrap' style='flex:1'><h1>Commission &amp; ledgers</h1><div class='muted' style='margin-bottom:14px'>KPI tiles: last 30 days · table: current ledger balances (all time) · both from ledger_entries — in this example all activity is within the last 30 days</div>
    <div style='display:flex;gap:14px;margin-bottom:16px'>
      <div class='card kpi'><div class='v'>2</div><div class='l'>Pending suppliers</div></div>
      <div class='card kpi'><div class='v'>{ORDERS_30D}</div><div class='l'>Orders (30 d)</div></div>
      <div class='card kpi'><div class='v'>{eur(TOTAL['sales_net'])}</div><div class='l'>GMV net (non-cancelled)</div></div>
      <div class='card kpi'><div class='v'>{eur(TOTAL['commission_earned'])}</div><div class='l'>Commission earned (delivered)</div></div></div>
    <div class='card' style='padding:0;overflow:hidden'><table><tr><th>Supplier</th><th class='r'>Sales (net)</th><th class='r'>Rate</th><th class='r'>Commission</th><th class='r'>of which earned</th><th class='r'>Paid out</th><th class='r'>Owed (balance)</th><th class='r'>Ready for payout</th></tr>{rows}</table></div>
    <div class='note'>Commission = Σ commission of non-cancelled sub-orders (rate snapshotted at checkout); earned = delivered only. Owed = Σ ledger entries (sale − commission − reversals − payouts). Ready for payout = delivered sub-orders of paid orders, minus payouts.</div>
    <div style='display:flex;gap:16px;margin-top:14px;align-items:flex-start'>
      <div class='card prop' style='flex:1.4'><div class='proptag'>PROPOSED — REVIEW-FINDINGS F3</div><h2 style='margin-top:4px'>Buyer payments to record</h2>
        <table><tr><th>Order</th><th class='r'>Amount due</th><th>Status</th><th></th></tr>{unpaid}</table>
        <div class='note'>From the bank statement → order_payments (receipt / refund, append-only) → payment status recomputed. Suppliers see "Paid" on their sub-orders.</div></div>
      <div class='card' style='flex:1;background:#F5F6F8'><h2>Default commission</h2><div><span class='btn g'>8,0 %</span> <span class='btn p'>Save</span></div>
        <div class='note'>Applies to new checkouts only; existing sub-orders keep their snapshotted rate. Per-supplier override on the supplier page. Every change is written to the audit log.</div>
        <div class='prop card' style='margin-top:10px;padding:10px'><div class='proptag'>PROPOSED — F3</div><span class='btn'>+ Record payout / adjustment</span></div></div></div>
    </div></div>"""
    return page("W4 — Admin commission & ledgers · DESIGN.md Admin commission layout · money-rules §4", body)

SCREENS = {"wf-1-catalogue": w1, "wf-2-checkout": w2, "wf-3-supplier-dashboard": w3, "wf-4-admin-commission": w4}
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1320, "height": 900}, device_scale_factor=2)
    for name, fn in SCREENS.items():
        h = fn(); (OUT / f"{name}.html").write_text(h); pg.set_content(h); pg.wait_for_timeout(150)
        pg.locator("body").screenshot(path=str(OUT / f"{name}.png"))
    b.close()
print("wireframes OK | supplier A:", {k: eur(v) for k, v in A.items() if k != "ledger"})
print("totals:", {k: eur(v) for k, v in TOTAL.items()}, "| orders:", ORDERS_30D)
