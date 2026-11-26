#!/usr/bin/env bash
# RLS tests (D4-B2): the real migrations, then docs/decisions-9-11/tests/rls_tests.sql with psql as the superuser.
#
#   scripts/test-rls.sh        # needs: docker compose -f docker-compose.dev.yml up -d postgres   and a .env
#
# It creates a THROWAWAY database next to `horeca` (the tests insert fixtures and are not repeatable), runs the migrate
# entry on it, runs the SQL tests through `docker compose exec` (so no psql is needed on the host) and drops it again.
# CI runs the same script. It never touches the `horeca` database.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.dev.yml)
DB="rls_test_$$"
SUPERUSER="${POSTGRES_USER:-postgres}"

# Passwords and the superuser come from .env (the same file the compose file uses).
set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a
: "${POSTGRES_OWNER_PASSWORD:?set POSTGRES_OWNER_PASSWORD in .env}"

psql_su() { "${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 --no-psqlrc -U "$SUPERUSER" "$@"; }

cleanup() { psql_su -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Same shape as the init script's `horeca` database: owned by horeca_owner, only our three logins may connect.
psql_su -d postgres -c "CREATE DATABASE $DB OWNER horeca_owner" >/dev/null
psql_su -d postgres -c "REVOKE CONNECT, TEMPORARY ON DATABASE $DB FROM PUBLIC" >/dev/null
psql_su -d postgres -c "GRANT CONNECT ON DATABASE $DB TO horeca_owner, horeca_app, horeca_worker" >/dev/null

echo "→ migrating $DB with the migrate entry (Drizzle migrations + pg-boss)"
DATABASE_MIGRATE_URL="postgres://horeca_owner:${POSTGRES_OWNER_PASSWORD}@127.0.0.1:5432/${DB}" \
  pnpm exec tsx --env-file-if-exists=.env src/migrate.ts

echo "→ running rls_tests.sql"
# Results go to /dev/null; the NOTICE lines (one per check, on stderr) stay. ON_ERROR_STOP makes a failed check exit non-zero.
psql_su -d "$DB" -q -f - < docs/decisions-9-11/tests/rls_tests.sql >/dev/null
echo "ALL RLS TESTS PASSED"
