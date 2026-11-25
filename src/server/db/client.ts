/**
 * Database connection pools (D2-B1).
 *
 * Two logins, two pools (decision 9.4):
 *   - app    → `DATABASE_URL`        → horeca_app    (web, and worker jobs acting FOR a user). RLS applies.
 *   - worker → `DATABASE_WORKER_URL` → horeca_worker (worker jobs acting for no user). Only the worker
 *     container has this variable, so the web process cannot open a system transaction even by mistake.
 *
 * Nothing outside `src/server/db` should import this file. Domain code gets a `tx` from `withTx()` /
 * `withSystemTx()` (tx.ts) — never a global `db` (CLAUDE.md rule 2).
 *
 * Pools are created lazily (first use) and cached on `globalThis`, so Next.js hot reload in development
 * does not open a new pool on every file save.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env.core";
import { getLogger } from "@/server/logger";
import * as schema from "./schema";

const log = getLogger("db");

export type Db = NodePgDatabase<typeof schema>;
/** The transaction handle every domain function receives as its first argument. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type Handle = { pool: Pool; db: Db };
const cache = globalThis as unknown as {
  __horecaDb?: { app?: Handle; worker?: Handle };
};
cache.__horecaDb ??= {};

function open(url: string, applicationName: string): Handle {
  const pool = new Pool({
    connectionString: url,
    // Shows up in pg_stat_activity, so you can see which process holds a connection.
    application_name: applicationName,
    max: 10,
  });
  // An idle client losing its connection (e.g. Postgres restart) must not crash the process.
  pool.on("error", (err) => {
    log.error({ err, pool: applicationName }, "idle client error");
  });
  return { pool, db: drizzle(pool, { schema }) };
}

/** horeca_app — used by withTx(). */
export function appDb(): Db {
  cache.__horecaDb!.app ??= open(env.DATABASE_URL, "horeca-app");
  return cache.__horecaDb!.app.db;
}

/** horeca_worker — used by withSystemTx(). Throws in any process without DATABASE_WORKER_URL. */
export function workerDb(): Db {
  cache.__horecaDb!.worker ??= open(env.DATABASE_WORKER_URL, "horeca-worker");
  return cache.__horecaDb!.worker.db;
}

/** Close both pools (worker shutdown, tests). Safe to call when a pool was never opened. */
export async function closeDb(): Promise<void> {
  const handles = cache.__horecaDb!;
  await Promise.all([handles.app?.pool.end(), handles.worker?.pool.end()]);
  cache.__horecaDb = {};
}
