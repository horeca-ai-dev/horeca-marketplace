/**
 * The single place that reads process.env (CLAUDE.md rule 14, enforced by ESLint).
 *
 * D2-B1 started this file with the database keys, D2-B2 added the Better Auth keys, D2-B4 the e-mail keys.
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
  /** Public URL of this deployment (e.g. https://staging.horeca.bogdandelic.online). */
  get APP_URL() {
    return required("APP_URL");
  },
  /** Base URL Better Auth uses for its own links and cookies (normally = APP_URL). */
  get BETTER_AUTH_URL() {
    return required("BETTER_AUTH_URL");
  },
  /** Signs session cookies. At least 32 random characters; different per environment. */
  get BETTER_AUTH_SECRET() {
    return required("BETTER_AUTH_SECRET");
  },
  /** "true" = anyone may register. Seed users are created server-side regardless. */
  get REGISTRATION_OPEN() {
    return process.env.REGISTRATION_OPEN === "true";
  },
  /** Sender of every e-mail, e.g. "HoReCa Marketplace <no-reply@…>". */
  get EMAIL_FROM() {
    return required("EMAIL_FROM");
  },
  /** SMTP server (Mailpit in every environment), e.g. smtp://127.0.0.1:1025. Worker only. */
  get SMTP_URL() {
    return required("SMTP_URL");
  },
  /** For dev tools that work without a value (drizzle-kit generate/check need no database). */
  has(
    key: "DATABASE_URL" | "DATABASE_WORKER_URL" | "DATABASE_MIGRATE_URL",
  ): boolean {
    return Boolean(process.env[key]);
  },
};
