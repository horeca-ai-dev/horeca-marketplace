/**
 * pg-boss instances — one per kind of process (D2-B4). Verified with pg-boss 12.38.2.
 *
 *   owner   migrate entry   installs/upgrades the pgboss schema, creates the queues     (migrate: true)
 *   web     Next.js         only SENDS jobs; no polling, no maintenance, no cron         (everything off)
 *   worker  src/worker.ts   fetches/completes jobs, runs maintenance (supervise) and cron (schedule)
 *
 * Why these options (found by running each login against a real pgboss schema):
 *   migrate: false          — only the owner may create/alter the schema; the others would fail
 *   registerInstance: false — web: it would need write access to pgboss.instance just for bookkeeping
 *   reindex: false          — worker: REINDEX needs the table OWNER ("must be owner of index"); with
 *                             our small tables index bloat is not a concern for the MVP
 *   persistQueueStats       — left at its default (off): turning it on makes the supervisor create
 *                             daily partitions (CREATE TABLE), which again only the owner may do
 */
import { PgBoss } from "pg-boss";
import { env } from "@/env.core";
import { getLogger } from "@/server/logger";

const log = getLogger("pg-boss");

const common = { schema: "pgboss", migrate: false } as const;

/** Migrate entry only (DATABASE_MIGRATE_URL = owner). */
export function createOwnerBoss(): PgBoss {
  return new PgBoss({
    connectionString: env.DATABASE_MIGRATE_URL,
    schema: "pgboss",
    migrate: true,
    supervise: false,
    schedule: false,
    application_name: "horeca-migrate-pgboss",
  });
}

/** Worker process (DATABASE_WORKER_URL = horeca_worker). */
export function createWorkerBoss(): PgBoss {
  return new PgBoss({
    ...common,
    connectionString: env.DATABASE_WORKER_URL,
    supervise: true,
    schedule: true,
    reindex: false,
    application_name: "horeca-worker-pgboss",
  });
}

// Web: one lazily started instance per process, cached on globalThis (Next.js hot reload).
const cache = globalThis as unknown as { __horecaWebBoss?: Promise<PgBoss> };

/**
 * The web process's sender (DATABASE_URL = horeca_app). Started on first use: pg-boss refuses send()
 * before start() ("Database not opened"). Its own small pool only reads the queue list; the job INSERT
 * itself runs on the caller's transaction (see enqueue.ts).
 */
export function webBoss(): Promise<PgBoss> {
  cache.__horecaWebBoss ??= (async () => {
    const boss = new PgBoss({
      ...common,
      connectionString: env.DATABASE_URL,
      supervise: false,
      schedule: false,
      registerInstance: false,
      max: 2,
      application_name: "horeca-app-pgboss",
    });
    boss.on("error", (err) => log.error({ err }, "pg-boss error"));
    await boss.start();
    return boss;
  })().catch((err: unknown) => {
    cache.__horecaWebBoss = undefined; // allow a retry on the next call
    throw err;
  });
  return cache.__horecaWebBoss;
}

/** Tests and graceful shutdown. */
export async function stopWebBoss(): Promise<void> {
  const pending = cache.__horecaWebBoss;
  cache.__horecaWebBoss = undefined;
  if (pending) await (await pending).stop({ graceful: false });
}
