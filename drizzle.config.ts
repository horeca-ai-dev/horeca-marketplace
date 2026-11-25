/**
 * drizzle-kit configuration (D2-B1).
 *
 * Used only by the developer tools: `pnpm db:generate` (writes a new migration from the schema),
 * `pnpm db:check` (are the migration files consistent?) and `pnpm db:studio`.
 * The app never loads this file — at runtime migrations are applied by src/server/db/migrate.ts.
 * Only db:studio needs a database URL; it connects as the OWNER.
 */
import { defineConfig } from "drizzle-kit";
import { env } from "./src/env.core";

// Node can read .env itself (no dotenv dependency). No .env (CI) is fine.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./src/server/db/migrations",
  dbCredentials: {
    url: env.has("DATABASE_MIGRATE_URL") ? env.DATABASE_MIGRATE_URL : "",
  },
  strict: true,
  verbose: true,
});
