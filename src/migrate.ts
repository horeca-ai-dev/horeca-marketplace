/**
 * Migrate entry point (like src/worker.ts): what `pnpm db:migrate` and the migrate container run.
 * Exits with code 1 on failure, so `docker compose` does not start web and worker on a broken schema.
 */
import { assertEnv } from "@/env.core";
import { runMigrations } from "@/server/db/migrate";

try {
  assertEnv("migrate");
} catch (err: unknown) {
  console.error("[migrate] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}

runMigrations().catch((err: unknown) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
