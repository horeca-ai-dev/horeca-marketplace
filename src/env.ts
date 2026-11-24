/**
 * The single place that reads process.env (CLAUDE.md rule 14, enforced by ESLint).
 *
 * D2-B1 starts this file with the database keys only, because the db clients need them first.
 * D2-A4 (Bogdan) extends it with the remaining keys, Zod validation and the build-time switch.
 *
 * Each key is checked when it is READ, not when this file is imported. The migrate and worker
 * entries do not have every web variable, and `next build` has none of them: importing env.ts
 * must never throw there.
 */

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Environment variable ${key} is not set (see .env.example)`,
    );
  }
  return value;
}

export const env = {
  /** horeca_app — web, and worker jobs acting for a user. */
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  /** horeca_worker — only the worker container has it. */
  get DATABASE_WORKER_URL() {
    return required("DATABASE_WORKER_URL");
  },
  /** horeca_owner — only the migrate entry (and drizzle-kit) use it. */
  get DATABASE_MIGRATE_URL() {
    return required("DATABASE_MIGRATE_URL");
  },
  /** Where the migrate entry finds the SQL files; the bundled migrate image may point elsewhere. */
  get MIGRATIONS_DIR() {
    return process.env.MIGRATIONS_DIR || "src/server/db/migrations";
  },
  /** For dev tools that work without a value (drizzle-kit generate/check need no database). */
  has(
    key: "DATABASE_URL" | "DATABASE_WORKER_URL" | "DATABASE_MIGRATE_URL",
  ): boolean {
    return Boolean(process.env[key]);
  },
};
