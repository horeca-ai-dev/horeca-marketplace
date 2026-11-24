"""Permission matrix image — rendered directly from permission-matrix.md §1 (so the picture cannot drift from the doc).
Usage: python3 matrix_v4.py <permission-matrix.md> <out_dir>
"""
import re, sys, html, pathlib
from playwright.sync_api import sync_playwright

md = pathlib.Path(sys.argv[1]).read_text()
out = pathlib.Path(sys.argv[2])
section = md.split("## 1. Matrix", 1)[1].split("**Status rules", 1)[0]
status_rules = "**Status rules" + md.split("**Status rules", 1)[1].split("## 2.", 1)[0]

def cell(c):
    c = html.escape(c.strip())
    c = re.sub(r"`([^`]+)`", r"<b>\1</b>", c)
    c = c.replace("✅", "<span class='y'>✓</span>").replace("✏️", "<span class='chg'>✏</span>")
    if c == "—": c = "<span class='n'>—</span>"
    return c

blocks, current = [], None
for line in section.splitlines():
    m = re.match(r"^\*\*(.+?)\*\*\s*$", line)
    if m: current = {"title": m.group(1), "rows": []}; blocks.append(current); continue
    if line.startswith("|") and current is not None and not re.match(r"^\|[-| ]+\|$", line):
        current["rows"].append([c for c in line.strip().strip("|").split("|")])
body = ""
for b in blocks:
    head, *rows = b["rows"]
    body += f"<tr><td class='grp' colspan='{len(head)}'>{html.escape(b['title'])}</td></tr>"
    body += "<tr>" + "".join(f"<th>{cell(h)}</th>" for h in head) + "</tr>"
    body += "".join("<tr>" + "".join(f"<td>{cell(c)}</td>" for c in r) + "</tr>" for r in rows)
rules = html.escape(status_rules.replace("**", "")).replace("·", "·")
page = f"""<html><head><meta charset='utf-8'><style>
body{{margin:0;font-family:Inter,system-ui,Arial;color:#1F2937;font-size:13px}} .f{{width:1240px;padding:20px 22px;border:1px solid #D9DDE3}}
h1{{font-size:21px;margin:0 0 4px}} .m{{color:#5B6472;margin-bottom:12px}}
table{{border-collapse:collapse;width:100%}} th{{background:#DCE6F5;text-align:center;padding:7px 8px;font-size:12px}} th:first-child{{text-align:left;width:31%}}
td{{padding:6px 8px;border-bottom:1px solid #EEF0F3;text-align:center}} td:first-child{{text-align:left}}
.grp{{background:#2B579A;color:#fff;font-weight:700;text-align:left;padding:7px 8px}} .y{{color:#1E7A4C;font-weight:700}} .n{{color:#A0A7B2}} .chg{{color:#6B3FA0}}
.note{{margin-top:12px;font-size:12px;color:#5B6472;line-height:1.5}}
</style></head><body><div class='f'><h1>Permission matrix (decision 9)</h1>
<div class='m'>✓ allowed · own = own organization's data only · — denied: foreign organization → 404, own organization but role not allowed → 403, wrong status → 409 · <span class='chg'>✏</span> = changed vs. the planning session (see DECISIONS-9-11.md §9.1) · second layer: Postgres RLS (rls.sql, 86 tests)</div>
<table>{body}</table><div class='note'>{rules}</div></div></body></html>"""
(out / "permission-matrix.html").write_text(page)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1300, "height": 900}, device_scale_factor=2)
    pg.set_content(page); pg.wait_for_timeout(150); pg.locator(".f").screenshot(path=str(out / "permission-matrix.png")); b.close()
print("matrix:", sum(len(b["rows"]) - 1 for b in blocks), "actions in", len(blocks), "groups")
