/**
 * Migrate entry point (D2-B1) — runs as the OWNER login (`DATABASE_MIGRATE_URL`).
 *
 * Started through the entry file `src/migrate.ts` (locally `pnpm db:migrate`; on the server the one-shot
 * `migrate` container that Bogdan bundles in D2-A4; in CI on an empty database after the init script).
 * Tests import runMigrations() directly.
 *
 * Applies every file in the migrations folder that is not yet recorded in drizzle.__drizzle_migrations,
 * in order, each inside a transaction. Safe to run again: already-applied migrations are skipped.
 *
 * D2-B4 extends this file (pg-boss schema, queues, grants) — the version in folder 4 replaces this one.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "@/env";

export async function runMigrations(): Promise<void> {
  const pool = new Pool({
    connectionString: env.DATABASE_MIGRATE_URL,
    application_name: "horeca-migrate",
    max: 1,
  });
  try {
    await migrate(drizzle(pool), { migrationsFolder: env.MIGRATIONS_DIR });
    console.log("[migrate] database migrations applied");
  } finally {
    await pool.end();
  }
}
