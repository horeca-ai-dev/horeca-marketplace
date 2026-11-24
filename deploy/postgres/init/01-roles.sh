#!/usr/bin/env bash
# Creates the three database logins and the `horeca` database (decision 9.4, APPLIED.md D2-B1).
#
# The official Postgres image runs this ONCE, as its superuser, and only when the data
# directory is EMPTY. Changing a password in .env later does nothing to an existing volume —
# reset it (locally: `docker compose -f docker-compose.dev.yml down -v`).
#
# Used unchanged by docker-compose.dev.yml, Testcontainers and the server.
# No tables, extensions or table grants here — those come from the migrations (run as horeca_owner).
set -euo pipefail

: "${POSTGRES_OWNER_PASSWORD:?POSTGRES_OWNER_PASSWORD must be set}"
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD must be set}"
: "${POSTGRES_WORKER_PASSWORD:?POSTGRES_WORKER_PASSWORD must be set}"

# Quoted heredoc: the shell expands nothing inside it. psql reads the passwords from the
# environment (\getenv) and inserts them as properly quoted literals (:'name'), so they are
# never concatenated into SQL and never appear on a command line.
psql -v ON_ERROR_STOP=1 --no-psqlrc --username "${POSTGRES_USER:-postgres}" --dbname postgres <<'SQL'
\getenv owner_password POSTGRES_OWNER_PASSWORD
\getenv app_password POSTGRES_APP_PASSWORD
\getenv worker_password POSTGRES_WORKER_PASSWORD

-- Owns the database and runs the migrations. Not a superuser, so RLS is not bypassed by accident.
CREATE ROLE horeca_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'owner_password';

-- Web app (and worker jobs acting for a user). RLS applies.
CREATE ROLE horeca_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'app_password';

-- Worker jobs acting for no user (system context). RLS applies.
CREATE ROLE horeca_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'worker_password';

CREATE DATABASE horeca OWNER horeca_owner;

-- Only our three logins may connect; PUBLIC also loses the right to create temp tables.
REVOKE CONNECT, TEMPORARY ON DATABASE horeca FROM PUBLIC;
GRANT CONNECT ON DATABASE horeca TO horeca_owner, horeca_app, horeca_worker;
SQL
