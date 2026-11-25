/**
 * Grants on the pg-boss schema (D2-B4) — run by the migrate entry, as the owner, right after pg-boss
 * has installed or upgraded its schema. Idempotent (GRANT twice is harmless), so it runs every time.
 *
 * Found by starting each login with no grants and adding only what failed (pg-boss 12.38.2,
 * PostgreSQL 16). Re-check after a pg-boss upgrade: run the integration test `enqueue.test.ts`.
 *
 * horeca_app (web) — SEND only:
 *   - read pgboss.version (start() checks the schema version) and pgboss.queue (queue cache)
 *   - INSERT into pgboss.job_common: every queue we create uses the shared job table
 *     (we never create queues with `partition: true`, which would give a queue its own table)
 *   - SELECT on (id, start_after, state) only: send() uses INSERT … RETURNING id, which needs read
 *     access to the returned columns; /api/health reads (state, start_after) to report a stuck worker
 *     (D2-A4). The app cannot read job payloads.
 *
 * horeca_worker — fetch / complete / fail, plus maintenance (supervise) and cron (schedule):
 *   these touch almost every pg-boss table (job, queue, schedule, version, instance, bam, …), so the
 *   worker gets plain read/write on all of them (the task's time-boxed fallback). It still cannot
 *   create, alter, drop or REINDEX anything: it does not own the schema.
 *   DEFAULT PRIVILEGES: tables a future pg-boss version adds (created by the owner) get the same grants.
 */
export const pgbossGrantsSql = /* sql */ `
GRANT USAGE ON SCHEMA pgboss TO horeca_app, horeca_worker;

GRANT SELECT ON pgboss.version, pgboss.queue TO horeca_app;
GRANT INSERT ON pgboss.job_common TO horeca_app;
GRANT SELECT (id, start_after, state) ON pgboss.job_common TO horeca_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO horeca_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO horeca_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE horeca_owner IN SCHEMA pgboss
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO horeca_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE horeca_owner IN SCHEMA pgboss
  GRANT USAGE, SELECT ON SEQUENCES TO horeca_worker;
`;
