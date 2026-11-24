/**
 * Migrate entry point (like src/worker.ts): what `pnpm db:migrate` and the migrate container run.
 * Exits with code 1 on failure, so `docker compose` does not start web and worker on a broken schema.
 */
import { runMigrations } from "@/server/db/migrate";

runMigrations().catch((err: unknown) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
