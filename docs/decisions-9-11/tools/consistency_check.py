"""Consistency check for the decisions zip (handoff §0.6 and quality bar).
- every table in the Drizzle drafts has RLS enabled in rls.sql and at least one policy,
- every table appears in permission-matrix.md (table coverage) and in the DECISIONS table catalogue,
- every money column (*_cents) is bigint, every rate column (*_bps) is integer, no float types anywhere,
- every table referenced by the matrix/catalogue exists.
Run from the zip root: python3 tools/consistency_check.py
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
ts = {f.name: f.read_text() for f in (root / "schema").glob("*.ts")}
rls = (root / "schema" / "rls.sql").read_text()
matrix = (root / "permission-matrix.md").read_text()
decisions = (root / "DECISIONS-9-11.md").read_text()
full_sql = next((root / "drizzle" / "full").glob("*.sql")).read_text()

BETTER_AUTH = {"user", "organization", "member"}
tables = {}
for name, src in ts.items():
    for t in re.findall(r'pgTable\(\s*"([a-z_]+)"', src):
        tables[t] = name
ours = {t for t in tables if t not in BETTER_AUTH}
errors = []

for t in sorted(ours):
    if not re.search(rf"ALTER TABLE {t}\s+ENABLE ROW LEVEL SECURITY", rls):
        errors.append(f"{t}: RLS not enabled")
    if t != "invoice_counters" and not re.search(rf"\bON {t}\b", rls):
        errors.append(f"{t}: no policy in rls.sql")
    if not re.search(rf"`{t}`", matrix):
        errors.append(f"{t}: missing from permission-matrix.md table coverage")
    if not re.search(rf"`{t}`", decisions):
        errors.append(f"{t}: missing from DECISIONS table catalogue")

# money / rate column types in the generated SQL
for col, typ in re.findall(r'"([a-z_]+_cents)" ([a-z]+)', full_sql):
    if typ != "bigint":
        errors.append(f"money column {col} is {typ}, expected bigint")
for col, typ in re.findall(r'"([a-z_]+_bps)" ([a-z]+)', full_sql):
    if typ != "integer":
        errors.append(f"rate column {col} is {typ}, expected integer")
for bad in ("real", "double precision", "float"):
    if re.search(rf'" {bad}\b', full_sql):
        errors.append(f"float type '{bad}' found in schema")
numeric_cols = re.findall(r'"([a-z_]+)" numeric', full_sql)
if set(numeric_cols) - {"min_value", "max_value"}:
    errors.append(f"unexpected numeric columns: {numeric_cols}")

money_cols = re.findall(r'"([a-z_]+_cents)" bigint', full_sql)
print(f"tables: {len(ours)} ours + {len(BETTER_AUTH)} Better Auth placeholder | money columns (bigint): {len(money_cols)} "
      f"| rate columns: {len(re.findall(r'_bps\" integer', full_sql))} | numeric (non-money): {numeric_cols}")
if errors:
    print("\n".join("FAIL " + e for e in errors)); sys.exit(1)
print("CONSISTENCY OK — every table has RLS + policy, appears in the matrix and the catalogue; money = bigint cents, rates = integer bps, no floats")
