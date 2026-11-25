#!/usr/bin/env bash
# G0 smoke test (D3-A1) — bash + curl only. Until D10 this is the E2E smoke test after every staging deploy.
#
#   SMOKE_BASE_URL=https://staging.horeca.bogdandelic.online \
#   SMOKE_BASIC_AUTH_USER=… SMOKE_BASIC_AUTH_PASS=… scripts/smoke-g0.sh
#
# Runs through BOTH proxies when pointed at the public URL (friend's proxy → Tailscale → our Nginx).
# Creates one throwaway user per run (smoke-<time>-<random>@example.com) — staging only, never production.
# Sign-in attempts per run: 2 (limit: 5 per minute per IP), sign-ups: 1 (limit: 3 per 10 s).
#
# Checks (PASS/FAIL each; exit 1 if any fails):
#   1 /api/health → 200, status "ok"
#   2 sign-up  (/api/auth/sign-up/email, Origin = base URL) → 200
#   3 sign-in  (/api/auth/sign-in/email, trusted Origin) → 200 + session cookie
#   4 /g0-check with the cookie → 200, and the server sees the session ("no-organization")
#   5 the page's Server Action ID is found in its client JS
#   6 the Server Action, same Origin → 200 + next-safe-action envelope with UNAUTHENTICATED
#     (the user has no organization: only our registration creates one, and its form is D4-A3)
#   7 the Server Action, foreign Origin → refused by Next.js (serverActions.allowedOrigins)
#   8 wrong password → 401
set -euo pipefail

base="${SMOKE_BASE_URL:?set SMOKE_BASE_URL, e.g. https://staging.horeca.bogdandelic.online}"
base="${base%/}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
jar="$work/cookies"
body="$work/body"
: >"$jar"

# Basic auth through a curl config file, so the password is never on a command line (ps, logs).
cfg="$work/curl.cfg"
: >"$cfg"
if [[ -n ${SMOKE_BASIC_AUTH_USER-} ]]; then
  printf 'user = "%s:%s"\n' "$SMOKE_BASIC_AUTH_USER" "${SMOKE_BASIC_AUTH_PASS:?set SMOKE_BASIC_AUTH_PASS}" >"$cfg"
fi

failures=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() {
  printf 'FAIL  %s\n' "$*"
  failures=$((failures + 1))
}
# http <curl args…> → prints the status code; the response body is in $body.
http() {
  curl --config "$cfg" --silent --show-error --max-time 20 \
    --cookie "$jar" --cookie-jar "$jar" \
    --output "$body" --write-out '%{http_code}' "$@" || echo "000"
}
snippet() { head -c 300 "$body" | tr '\n' ' '; }

echo "G0 smoke test against $base"

# 1 ── health ──────────────────────────────────────────────────────────────────────────────────────
code="$(http "$base/api/health")"
if [[ $code == 200 ]] && grep -q '"status":"ok"' "$body"; then
  pass "1 /api/health → 200 ok"
else
  fail "1 /api/health → $code $(snippet)"
fi

# 2 ── sign-up ─────────────────────────────────────────────────────────────────────────────────────
email="smoke-$(date -u +%Y%m%d%H%M%S)-$RANDOM@example.com"
password="Smoke-$RANDOM$RANDOM-pw!"
auth_json() { printf '{"name":"G0 smoke","email":"%s","password":"%s"}' "$email" "$1"; }

code="$(http -X POST "$base/api/auth/sign-up/email" \
  -H "Origin: $base" -H 'Content-Type: application/json' --data "$(auth_json "$password")")"
if [[ $code == 200 ]]; then pass "2 sign-up $email → 200"; else fail "2 sign-up → $code $(snippet)"; fi

# 3 ── sign-in (fresh cookie jar, so the cookie really comes from sign-in) ──────────────────────────
: >"$jar"
code="$(http -X POST "$base/api/auth/sign-in/email" \
  -H "Origin: $base" -H 'Content-Type: application/json' --data "$(auth_json "$password")")"
if [[ $code == 200 ]] && grep -q 'better-auth.session_token' "$jar"; then
  pass "3 sign-in → 200 + session cookie"
else
  fail "3 sign-in → $code $(snippet)"
fi

# 4 ── the G0 page sees the session ────────────────────────────────────────────────────────────────
code="$(http "$base/g0-check")"
cp "$body" "$work/page.html"
if [[ $code == 200 ]] && grep -q 'no-organization' "$work/page.html"; then
  pass "4 /g0-check → 200, session recognised (no-organization)"
else
  fail "4 /g0-check → $code (expected 200 with 'no-organization')"
fi

# 5 ── find the Server Action's ID in the page's client chunks ─────────────────────────────────────
# Next.js compiles the client import into createServerReference("<id>", …, "pingAction").
action_id=""
while read -r chunk; do
  [[ -n $chunk ]] || continue
  [[ $(http "$base$chunk") == 200 ]] || continue
  action_id="$(grep -aoE '"[0-9a-f]{40,}",[^"]{0,200}"pingAction"' "$body" | head -n1 | grep -oE '[0-9a-f]{40,}' || true)"
  [[ -n $action_id ]] && break
done < <(grep -oE '/_next/static/chunks/[A-Za-z0-9_.~-]+\.js' "$work/page.html" | sort -u)
if [[ -n $action_id ]]; then
  pass "5 Server Action ID found ($action_id)"
else
  fail "5 Server Action ID not found in the page's chunks (did the Next.js chunk format change?)"
fi

call_action() {
  http -X POST "$base/g0-check" -H "Origin: $1" -H "Next-Action: $action_id" \
    -H 'Accept: text/x-component' -H 'Content-Type: text/plain;charset=UTF-8' \
    --data '[{"note":"smoke"}]'
}

# 6 ── the Server Action, same Origin ──────────────────────────────────────────────────────────────
if [[ -n $action_id ]]; then
  code="$(call_action "$base")"
  if [[ $code == 200 ]] && grep -q '"serverError":{"ok":false,"code":"UNAUTHENTICATED"' "$body"; then
    pass "6 Server Action → 200, envelope UNAUTHENTICATED (reached the actor middleware)"
  else
    fail "6 Server Action → $code $(snippet)"
  fi

  # 7 ── the Server Action, foreign Origin (CSRF) ────────────────────────────────────────────────
  code="$(call_action "https://evil.example")"
  if [[ $code != 200 ]] && ! grep -q '"serverError"' "$body"; then
    pass "7 Server Action from a foreign Origin refused ($code)"
  else
    fail "7 Server Action from a foreign Origin → $code $(snippet)"
  fi
else
  fail "6 Server Action not called (no ID)"
  fail "7 foreign-Origin check not run (no ID)"
fi

# 8 ── wrong password ──────────────────────────────────────────────────────────────────────────────
: >"$jar"
code="$(http -X POST "$base/api/auth/sign-in/email" \
  -H "Origin: $base" -H 'Content-Type: application/json' --data "$(auth_json 'Wrong-password-1')")"
if [[ $code == 401 ]]; then pass "8 wrong password → 401"; else fail "8 wrong password → $code $(snippet)"; fi

# ── Not automated ─────────────────────────────────────────────────────────────────────────────────
cat <<EOF

NOT COVERED BY G0 (automated or manual):
  - the action running as horeca_app with the RLS context set (needs a user WITH an organization;
    proven by the D4/D5 RLS tests and the register form, D4-A3)

MANUAL CHECK — rate limit per client IP ("two networks"), through both proxies.
(There is no login form before D4-A3, so both networks use the same curl loop.)
  1. Laptop on home Wi-Fi — 6 wrong sign-ins within a minute; the 6th must answer 429:
       for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code} ' -u '<user>:<pass>' \\
         -X POST $base/api/auth/sign-in/email -H 'Origin: $base' \\
         -H 'Content-Type: application/json' --data '{"email":"nobody@example.com","password":"x"}'; done
     → 401 401 401 401 401 429
  2. Within that minute, switch the laptop to the PHONE's hotspot (mobile data, Wi-Fi off on the
     phone) and run the loop again → the first answers must be 401, NOT 429.
  If the second network also gets 429, every visitor shares one bucket: check that our Nginx sets
  X-Real-IP from the friend's X-Forwarded-For (set_real_ip_from) and that the friend's proxy sends it.
EOF

echo
if ((failures > 0)); then
  echo "G0 smoke: $failures check(s) FAILED"
  exit 1
fi
echo "G0 smoke: all automated checks passed"
