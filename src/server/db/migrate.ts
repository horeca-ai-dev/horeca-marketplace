/**
 * Migrate entry (D2-B1 + D2-B4) — runs as the OWNER login (`DATABASE_MIGRATE_URL`).
 * Replaces the D2-B1 version of this file.
 *
 * Started through `src/migrate.ts` (locally `pnpm db:migrate`; on the server the one-shot `migrate`
 * container that Bogdan bundles in D2-A4; in CI on an empty database after the init script).
 * Tests import runMigrations() directly. Safe to run again — every step is idempotent.
 *
 *   1. Drizzle migrations (our tables, grants, later RLS policies)
 *   2. pg-boss: install / upgrade its schema, create every queue from queues.ts
 *   3. grants on the pg-boss schema for horeca_app and horeca_worker
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "@/env";
import { createOwnerBoss } from "@/server/jobs/boss";
import { pgbossGrantsSql } from "@/server/jobs/pgboss-grants";
import { QUEUE_NAMES } from "@/server/jobs/queues";

export async function runMigrations(): Promise<void> {
  const pool = new Pool({
    connectionString: env.DATABASE_MIGRATE_URL,
    application_name: "horeca-migrate",
    max: 1,
  });
  try {
    // 1.
    await migrate(drizzle(pool), { migrationsFolder: env.MIGRATIONS_DIR });
    console.log("[migrate] database migrations applied");

    // 2. start() with migrate: true creates or upgrades the pgboss schema, then we stop again —
    //    this process never works on jobs.
    const boss = createOwnerBoss();
    boss.on("error", (err) => console.error("[migrate] pg-boss:", err.message));
    await boss.start();
    try {
      for (const name of QUEUE_NAMES) await boss.createQueue(name);
    } finally {
      await boss.stop({ graceful: false });
    }
    console.log(
      `[migrate] pg-boss schema ready, queues: ${QUEUE_NAMES.join(", ")}`,
    );

    // 3.
    await pool.query(pgbossGrantsSql);
    console.log("[migrate] pg-boss grants applied");
  } finally {
    await pool.end();
  }
}
