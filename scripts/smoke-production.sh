#!/usr/bin/env bash
# Production smoke test (D5-A1) — bash + curl only, run by the Deploy workflow after every production deploy.
#
#   SMOKE_BASE_URL=https://horeca.bogdandelic.online scripts/smoke-production.sh
#
# READ-ONLY on purpose: no sign-up, no sign-in that succeeds, no Server Action — nothing that writes test
# data into production. (The full G0 checks run on staging: scripts/smoke-g0.sh.) Runs through BOTH
# proxies when pointed at the public URL (friend's proxy → Tailscale → our Nginx → app).
# Sign-in attempts per run: 1, for an address that cannot exist (limit: 5 per minute per IP).
#
# Checks (PASS/FAIL each; exit 1 if any fails):
#   1 /api/health → 200 with status "ok" ("degraded" = WARN: search, mail, worker or Garage not
#     healthy — the same rule as the deploy gate; the components are printed)
#   2 /login → 200 and the page holds the password field
#   3 wrong password (/api/auth/sign-in/email, trusted Origin) → 401
set -euo pipefail

base="${SMOKE_BASE_URL:?set SMOKE_BASE_URL, e.g. https://horeca.bogdandelic.online}"
base="${base%/}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
body="$work/body"

failures=0
pass() { printf 'PASS  %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; }
fail() {
  printf 'FAIL  %s\n' "$*"
  failures=$((failures + 1))
}
# http <curl args…> → prints the status code; the response body is in $body. No cookie jar: nothing
# here should ever log in.
http() {
  curl --silent --show-error --max-time 20 \
    --output "$body" --write-out '%{http_code}' "$@" || echo "000"
}
snippet() { head -c 300 "$body" | tr '\n' ' '; }

echo "Production smoke test against $base"

# 1 ── health ──────────────────────────────────────────────────────────────────────────────────────
code="$(http "$base/api/health")"
if [[ $code == 200 ]] && grep -q '"status":"ok"' "$body"; then
  pass "1 /api/health → 200 ok"
elif [[ $code == 200 ]] && grep -q '"status":"degraded"' "$body"; then
  warn "1 /api/health → 200 degraded (not blocking): $(snippet)"
else
  fail "1 /api/health → $code $(snippet)"
fi

# 2 ── the login page renders ──────────────────────────────────────────────────────────────────────
code="$(http "$base/login")"
# -i: React writes the attribute as autoComplete="…" (HTML attribute names are case-insensitive).
if [[ $code == 200 ]] && grep -qi 'autocomplete="current-password"' "$body"; then
  pass "2 /login → 200 with the password field"
else
  fail "2 /login → $code (expected 200 with the login form)"
fi

# 3 ── wrong password is refused ───────────────────────────────────────────────────────────────────
# example.com is reserved (RFC 2606) and registration is closed on production: the account does not
# exist, so the attempt creates nothing.
code="$(http -X POST "$base/api/auth/sign-in/email" \
  -H "Origin: $base" -H 'Content-Type: application/json' \
  --data '{"email":"smoke-wrong-password@example.com","password":"Wrong-password-1"}')"
if [[ $code == 401 ]]; then pass "3 wrong password → 401"; else fail "3 wrong password → $code $(snippet)"; fi

echo
if ((failures > 0)); then
  echo "Production smoke: $failures check(s) FAILED"
  exit 1
fi
echo "Production smoke: all checks passed"
