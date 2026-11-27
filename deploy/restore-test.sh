#!/usr/bin/env bash
# restore-test.sh <dump> — restore a pg_dump (pre-deploy or nightly) into a THROWAWAY Postgres and check
# that what a real restore needs came back (D5-A1; README → Server → Backups → Restore test).
#
#   sudo -u deploy /opt/horeca/bin/restore-test.sh /var/backups/horeca/production/pre-deploy/db-….dump
#
# Installed by hand to /opt/horeca/bin/restore-test.sh (root, 755). Runs as deploy (docker group; the
# dumps are deploy's, mode 600). Locally: RESTORE_INIT_DIR=deploy/postgres/init deploy/restore-test.sh <dump>.
#
# How: a fresh postgres container (the same image pin as deploy/compose.yml) with NO network, random
# throwaway passwords and OUR init script — exactly how the server's database starts — then
# `pg_restore --single-transaction --exit-on-error` of the dump through stdin (nothing is mounted).
# The container and its volume are removed at the end, also on failure (the dump holds personal data).
# Production is never touched.
#
# Checks (PASS/FAIL each; exit 1 if any fails):
#   1 the three logins exist (LOGIN, not superuser, no BYPASSRLS) and each one can log in by password
#   2 grants: horeca_app reads drizzle.__drizzle_migrations and pgboss.version, horeca_worker reads
#     pgboss.queue — as themselves, so a missing grant fails; RLS policies came back too
#   3 the pg-boss schema is there with its version row
#   4 row counts: EVERY table's count(*) equals the number of rows the dump holds for it, and at least
#     one migration is recorded
# A real restore (after a broken migration) = these same steps against the environment's own Postgres,
# with the app stopped — README → Rollback.
set -euo pipefail

readonly IMAGE=postgres:16.15-trixie # = deploy/compose.yml
readonly INIT_DIR="${RESTORE_INIT_DIR:-/opt/horeca/deploy/postgres/init}"
readonly READY_TIMEOUT_S=90

die() {
  echo "restore-test.sh: $*" >&2
  exit 2
}
[[ $# -eq 1 ]] || die "usage: restore-test.sh <dump file>"
dump="$1"
[[ -f $dump && -r $dump ]] || die "cannot read $dump"
[[ -r $INIT_DIR/01-roles.sh ]] || die "init script not found in $INIT_DIR (set RESTORE_INIT_DIR)"
init_dir_abs="$(cd "$INIT_DIR" && pwd)"

failures=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() {
  printf 'FAIL  %s\n' "$*"
  failures=$((failures + 1))
}

rand_hex() { od -An -N16 -tx1 /dev/urandom | tr -d ' \n'; }
declare -A password=(
  [horeca_owner]="$(rand_hex)"
  [horeca_app]="$(rand_hex)"
  [horeca_worker]="$(rand_hex)"
)

name="horeca-restore-test-$$-$RANDOM"
cleanup() { docker rm --force --volumes "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Restore test of $dump"
docker run --detach --name "$name" --network none --memory 512m \
  -e POSTGRES_PASSWORD="$(rand_hex)" \
  -e POSTGRES_OWNER_PASSWORD="${password[horeca_owner]}" \
  -e POSTGRES_APP_PASSWORD="${password[horeca_app]}" \
  -e POSTGRES_WORKER_PASSWORD="${password[horeca_worker]}" \
  -v "$init_dir_abs:/docker-entrypoint-initdb.d:ro" \
  "$IMAGE" >/dev/null

# TCP readiness on loopback = the init script has finished (it runs on a socket-only server first).
deadline=$((SECONDS + READY_TIMEOUT_S))
until docker exec "$name" pg_isready --quiet -h 127.0.0.1 -U postgres 2>/dev/null; do
  if ((SECONDS >= deadline)) || [[ $(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null) != true ]]; then
    docker logs --tail 40 "$name" 2>&1 || true
    die "the throwaway Postgres did not become ready (init script failed?)"
  fi
  sleep 2
done

# psql as the superuser over the socket; -At = bare values. No -i: these never read stdin (inside the
# row-count loop below, -i would swallow the rest of the loop's input).
psql_su() { docker exec "$name" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d horeca "$@"; }
# psql as one of our logins, by password over TCP — proves the login and its grants, not the superuser's.
psql_as() {
  local role="$1"
  shift
  docker exec -e PGPASSWORD="${password[$role]}" "$name" \
    psql -X -At -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$role" -d horeca "$@"
}

echo "→ pg_restore (single transaction, stops at the first error)"
docker exec -i "$name" pg_restore --username postgres --dbname horeca \
  --single-transaction --exit-on-error <"$dump" ||
  die "pg_restore failed — the dump does not restore cleanly"

# 1 ── the three logins ────────────────────────────────────────────────────────────────────────────
n="$(psql_su -c "SELECT count(*) FROM pg_roles WHERE rolname IN ('horeca_owner','horeca_app','horeca_worker')
                 AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls")"
if [[ $n == 3 ]]; then pass "1a three logins: LOGIN, NOSUPERUSER, NOBYPASSRLS"; else fail "1a logins found: $n of 3"; fi
for role in horeca_owner horeca_app horeca_worker; do
  if [[ $(psql_as "$role" -c 'SELECT current_user' 2>/dev/null) == "$role" ]]; then
    pass "1b $role logs in by password"
  else
    fail "1b $role cannot log in"
  fi
done

# 2 ── grants and policies ─────────────────────────────────────────────────────────────────────────
grant_check() { # <role> <table>
  if psql_as "$1" -c "SELECT count(*) FROM $2" >/dev/null 2>&1; then
    pass "2  $1 may read $2"
  else
    fail "2  $1 may NOT read $2 (grant missing)"
  fi
}
grant_check horeca_app drizzle.__drizzle_migrations
grant_check horeca_app pgboss.version
grant_check horeca_worker pgboss.queue
policies="$(psql_su -c 'SELECT count(*) FROM pg_policies')"
rls_tables="$(psql_su -c 'SELECT count(*) FROM pg_class WHERE relrowsecurity')"
if ((policies > 0 && rls_tables > 0)); then
  pass "2  RLS: $policies policies on $rls_tables tables"
else
  fail "2  RLS: $policies policies on $rls_tables tables"
fi

# 3 ── pg-boss ─────────────────────────────────────────────────────────────────────────────────────
boss_version="$(psql_su -c 'SELECT version FROM pgboss.version' 2>/dev/null || true)"
if [[ -n $boss_version ]]; then pass "3  pg-boss schema, version $boss_version"; else fail "3  pg-boss schema or version row missing"; fi

# 4 ── row counts: restored vs. the dump itself ────────────────────────────────────────────────────
# The data section as SQL: one `COPY schema.table (…) FROM stdin;` block per table, one line per row
# (COPY text format escapes newlines), ended by `\.`.
migrations="$(psql_su -c 'SELECT count(*) FROM drizzle.__drizzle_migrations' 2>/dev/null || echo 0)"
if ((migrations > 0)); then pass "4a $migrations migrations recorded"; else fail "4a no migrations recorded"; fi

tables=0 rows=0 mismatches=0
while read -r table expected; do
  if [[ ! $table =~ ^[a-z_][a-z0-9_]*\.(\"?[a-z_][a-z0-9_]*\"?)$ ]]; then
    fail "4b unexpected table name in the dump: $table"
    mismatches=$((mismatches + 1))
    continue
  fi
  actual="$(psql_su -c "SELECT count(*) FROM $table")"
  if [[ $actual != "$expected" ]]; then
    fail "4b $table: dump $expected rows, restored $actual"
    mismatches=$((mismatches + 1))
  fi
  tables=$((tables + 1)) rows=$((rows + expected))
done < <(
  docker exec -i "$name" pg_restore --data-only --file - <"$dump" |
    awk '/^COPY [^ ]+ .* FROM stdin;$/ { t = $2; n = 0; inside = 1; next }
         inside && /^\\\.$/            { print t, n; inside = 0; next }
         inside                        { n++ }'
)
if ((tables > 0 && mismatches == 0)); then
  pass "4b row counts match for all $tables tables ($rows rows)"
elif ((tables == 0)); then
  fail "4b no table data found in the dump"
fi

echo
if ((failures > 0)); then
  echo "Restore test: $failures check(s) FAILED"
  exit 1
fi
echo "Restore test: all checks passed"
