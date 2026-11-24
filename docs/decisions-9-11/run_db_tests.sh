#!/usr/bin/env bash
# Reproduce the verification: fresh database → generated Drizzle SQL → rls.sql → RLS tests.
# Usage:  PG_ADMIN="postgresql://postgres:postgres@localhost:5432/postgres" ./run_db_tests.sh [mvp|full]
# Needs a PostgreSQL 16 superuser (e.g. `docker run -p 127.0.0.1:5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`).
# Regenerate the SQL first if the schema changed:  npx drizzle-kit generate --config drizzle.mvp.config.ts --name mvp
set -euo pipefail
mode=${1:-mvp}; db="d911_${mode}"
: "${PG_ADMIN:?set PG_ADMIN to a superuser connection string}"
dbconn() { echo "${PG_ADMIN%/*}/${db}"; }
case "$PG_ADMIN" in postgres*://*) DB_CONN=$(dbconn) ;; *) DB_CONN="$PG_ADMIN dbname=$db" ;; esac
psql "$PG_ADMIN" -qc "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
run() { psql "$DB_CONN" -v ON_ERROR_STOP=1 -q "$@"; }
run -c "CREATE EXTENSION IF NOT EXISTS ltree; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS btree_gist;"
sed 's/--> statement-breakpoint//' drizzle/$mode/*.sql | run -f -
if [ "$mode" = mvp ]; then sed '/═* STRETCH ═*/,$d' schema/rls.sql | run -f -; else run -f schema/rls.sql; fi
run -f tests/rls_tests.sql 2>&1 | grep -E "OK|FAIL|PASSED|ERROR" | sed 's/^psql:[^ ]* NOTICE:  //'
if [ "$mode" = full ]; then run -f tests/rls_stretch_tests.sql 2>&1 | grep -E "OK|FAIL|PASSED|ERROR" | sed 's/^psql:[^ ]* NOTICE:  //'; fi
