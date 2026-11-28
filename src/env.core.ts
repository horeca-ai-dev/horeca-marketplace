/**
 * The single place that reads process.env (CLAUDE.md rule 14, enforced by ESLint).
 *
 * Two files, one module:
 *   src/env.core.ts  (this file) — schemas, getters, assertEnv(). No `server-only`, so plain Node can
 *                    load it: the worker and migrate bundles, drizzle-kit, Vitest, and every module
 *                    those reach (db client, pg-boss, e-mail, auth — tests import auth too).
 *   src/env.ts       — `import "server-only"` + re-export. For Next.js-only code (src/app, src/components,
 *                    instrumentation.ts); ESLint stops those folders from importing this file directly,
 *                    so a Client Component that touches configuration fails the build.
 *
 * History: D2-B1 started the getters (database keys), D2-B2 added Better Auth, D2-B4 e-mail; D2-A4 added
 * Zod validation, the remaining keys, assertEnv() and the build-time switch.
 *
 * Two ways a key is checked:
 *   1. When it is READ (the getters below): importing this file never throws — `next build`, drizzle-kit
 *      and the tests run without most variables.
 *   2. At startup, all at once: assertEnv("web" | "worker" | "migrate" | …) checks every key that entry point
 *      needs and lists every problem in one error, so a container with a missing or malformed variable
 *      refuses to boot (README → "Environment variables"). Error messages name keys, never values.
 *
 * Build-time switch: SKIP_ENV_VALIDATION=1 makes assertEnv() a no-op (the Docker build stage sets it);
 * `next build` is also detected through NEXT_PHASE, so CI and local builds need nothing.
 */
import { z } from "zod";

// ── Schemas ──────────────────────────────────────────────────────────────────────────────────────

const url = z.url();
const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });
const smtpUrl = z.url({ protocol: /^smtps?$/ });
const httpUrl = z.url({ protocol: /^https?$/ });
const nonEmpty = z.string().min(1);
const secret32 = z.string().min(32, "must be at least 32 characters");
/** "true" / "false" only (a typo like "ture" is an error, not silently false). */
const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const schema = {
  APP_ENV: z.enum(["local", "staging", "production"]),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  APP_URL: url,

  DATABASE_URL: postgresUrl,
  DATABASE_WORKER_URL: postgresUrl,
  DATABASE_MIGRATE_URL: postgresUrl,
  MIGRATIONS_DIR: nonEmpty.default("src/server/db/migrations"),

  BETTER_AUTH_URL: url,
  BETTER_AUTH_SECRET: secret32,
  REGISTRATION_OPEN: flag,
  /** Password of the seeded demo accounts. Optional: only production insists on it (see the seed). */
  SEED_DEMO_PASSWORD: z
    .string()
    .min(8, "must be at least 8 characters")
    .optional(),

  MEILI_HOST: url,
  MEILI_API_KEY: z.string().min(16, "must be at least 16 characters"),

  /** Media storage: S3-compatible object storage, Garage in every environment (decision 013). */
  S3_ENDPOINT: httpUrl,
  S3_REGION: nonEmpty,
  /** S3 bucket naming rules: 3-63 characters, lower-case letters, digits, dots and hyphens. */
  S3_BUCKET: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,
      "is not a valid S3 bucket name",
    ),
  S3_ACCESS_KEY_ID: nonEmpty,
  S3_SECRET_ACCESS_KEY: nonEmpty,
  /** Garage needs path-style requests (no bucket sub-domains); "false" only for a provider that wants virtual-host style. */
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  EMAIL_FROM: nonEmpty,
  SMTP_URL: smtpUrl,

  PAYMENT_GATEWAY_URL: url,
  PAYMENT_GATEWAY_API_KEY: nonEmpty,
  PAYMENT_WEBHOOK_SECRET: secret32,
  SUPPLIER_API_URL: url,
  SUPPLIER_API_KEY: nonEmpty,

  /** mock-services only (D6-A3). The port is 4010 in every environment. */
  MOCK_SERVICES_PORT: z.coerce.number().int().min(1).max(65535).default(4010),
  /** 127.0.0.1 on a developer's machine; the container sets 0.0.0.0 (reachable on the Compose network only). */
  MOCK_SERVICES_HOST: nonEmpty.default("127.0.0.1"),
  /** JSON: behaviour per supplier external code — parsed and checked in src/mock-services/config.ts. */
  MOCK_SUPPLIER_BEHAVIOUR: nonEmpty.default("{}"),
  /** Quantity the mock answers for a SKU that is not in its seed data. */
  MOCK_DEFAULT_STOCK: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .default(100),

  AI_ENABLED: flag,
  ANTHROPIC_API_KEY: nonEmpty,
  ANTHROPIC_MODEL: nonEmpty,
} satisfies Record<string, z.ZodType>;

type Key = keyof typeof schema;
type Value<K extends Key> = z.output<(typeof schema)[K]>;

/** What each entry point needs at startup. Keys with a default are listed only where they matter. */
const ROLE_KEYS = {
  web: [
    "APP_ENV",
    "LOG_LEVEL",
    "APP_URL",
    "DATABASE_URL",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "REGISTRATION_OPEN",
    "MEILI_HOST",
    "MEILI_API_KEY",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_FORCE_PATH_STYLE",
    "PAYMENT_GATEWAY_URL",
    "PAYMENT_GATEWAY_API_KEY",
    "PAYMENT_WEBHOOK_SECRET",
    "SUPPLIER_API_URL",
    "SUPPLIER_API_KEY",
    "AI_ENABLED",
  ],
  worker: [
    "APP_ENV",
    "LOG_LEVEL",
    "APP_URL",
    "DATABASE_URL",
    "DATABASE_WORKER_URL",
    "MEILI_HOST",
    "MEILI_API_KEY",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_FORCE_PATH_STYLE",
    "EMAIL_FROM",
    "SMTP_URL",
    "PAYMENT_GATEWAY_URL",
    "PAYMENT_GATEWAY_API_KEY",
    "SUPPLIER_API_URL",
    "SUPPLIER_API_KEY",
    "AI_ENABLED",
  ],
  migrate: ["DATABASE_MIGRATE_URL", "MIGRATIONS_DIR"],
  // Reference rows as the owner; demo users through Better Auth, which needs the app login and its secrets.
  seed: [
    "APP_ENV",
    "APP_URL",
    "DATABASE_URL",
    "DATABASE_MIGRATE_URL",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
  ],
  // An external system: no database, no storage, no auth — only its own port, key and behaviour.
  "mock-services": [
    "LOG_LEVEL",
    "SUPPLIER_API_KEY",
    "MOCK_SERVICES_PORT",
    "MOCK_SERVICES_HOST",
    "MOCK_SUPPLIER_BEHAVIOUR",
    "MOCK_DEFAULT_STOCK",
  ],
} as const satisfies Record<string, readonly Key[]>;

export type EnvRole = keyof typeof ROLE_KEYS;

// ── Reading ──────────────────────────────────────────────────────────────────────────────────────

/** An empty string counts as "not set" (KEY= in an env file), so defaults and "required" behave. */
function raw(key: string): string | undefined {
  const value = process.env[key];
  return value === "" ? undefined : value;
}

function parse<K extends Key>(
  key: K,
): { ok: true; value: Value<K> } | { ok: false; problem: string } {
  const value = raw(key);
  const result = schema[key].safeParse(value);
  if (result.success) return { ok: true, value: result.data as Value<K> };
  // Only Zod's message, never the value: it may be a secret.
  const problem =
    value === undefined
      ? "is not set"
      : (result.error.issues[0]?.message ?? "is invalid");
  return { ok: false, problem };
}

function read<K extends Key>(key: K): Value<K> {
  const result = parse(key);
  if (!result.ok)
    throw new Error(
      `Environment variable ${key} ${result.problem} (see .env.example)`,
    );
  return result.value;
}

/**
 * Checks every key the entry point needs and throws ONE error listing all problems.
 * Called first thing by src/instrumentation.ts (web), src/worker.ts, src/migrate.ts and src/seed.ts.
 */
export function assertEnv(role: EnvRole): void {
  if (raw("SKIP_ENV_VALIDATION") === "1") return;
  if (raw("NEXT_PHASE") === "phase-production-build") return;

  const keys: Key[] = [...ROLE_KEYS[role]];
  // The Claude API key is needed only when the AI features are switched on (stretch S3/S4).
  if (
    role !== "migrate" &&
    role !== "mock-services" &&
    raw("AI_ENABLED") === "true"
  )
    keys.push("ANTHROPIC_API_KEY", "ANTHROPIC_MODEL");

  const problems: string[] = [];
  for (const key of keys) {
    const result = parse(key);
    if (!result.ok) problems.push(`  - ${key} ${result.problem}`);
  }
  if (problems.length > 0)
    throw new Error(
      `Invalid environment for "${role}" (see .env.example):\n${problems.join("\n")}`,
    );
}

// ── Getters (the API every caller uses: env.KEY) ─────────────────────────────────────────────────

export const env = {
  /** local | staging | production. */
  get APP_ENV() {
    return read("APP_ENV");
  },
  /** pino level (D3-B3). */
  get LOG_LEVEL() {
    return read("LOG_LEVEL");
  },
  /** Public URL of this deployment (e.g. https://staging.horeca.bogdandelic.online). */
  get APP_URL() {
    return read("APP_URL");
  },

  /** horeca_app — web, and worker jobs acting for a user. */
  get DATABASE_URL() {
    return read("DATABASE_URL");
  },
  /** horeca_worker — only the worker container has it. */
  get DATABASE_WORKER_URL() {
    return read("DATABASE_WORKER_URL");
  },
  /** horeca_owner — only the migrate entry (and drizzle-kit) use it. */
  get DATABASE_MIGRATE_URL() {
    return read("DATABASE_MIGRATE_URL");
  },
  /** Where the migrate entry finds the SQL files; the image sets /app/migrations. */
  get MIGRATIONS_DIR() {
    return read("MIGRATIONS_DIR");
  },

  /** Base URL Better Auth uses for its own links and cookies (normally = APP_URL). */
  get BETTER_AUTH_URL() {
    return read("BETTER_AUTH_URL");
  },
  /** Signs session cookies. At least 32 random characters; different per environment. */
  get BETTER_AUTH_SECRET() {
    return read("BETTER_AUTH_SECRET");
  },
  /** "true" = anyone may register. Seed users are created server-side regardless. */
  get REGISTRATION_OPEN() {
    return read("REGISTRATION_OPEN");
  },
  /** Password of the demo accounts; undefined when not set. Production refuses to seed without it. */
  get SEED_DEMO_PASSWORD() {
    return read("SEED_DEMO_PASSWORD");
  },

  /** Meilisearch base URL — server-side only. */
  get MEILI_HOST() {
    return read("MEILI_HOST");
  },
  /** Meilisearch key (master key locally, a scoped key on the server). */
  get MEILI_API_KEY() {
    return read("MEILI_API_KEY");
  },

  /** S3 API of the media storage (product images, invoice PDFs): Garage locally and on the server. */
  get S3_ENDPOINT() {
    return read("S3_ENDPOINT");
  },
  /** Must match `s3_region` in deploy/garage/garage.toml (`garage`). */
  get S3_REGION() {
    return read("S3_REGION");
  },
  /** One bucket per environment (`horeca-media`). */
  get S3_BUCKET() {
    return read("S3_BUCKET");
  },
  /** The app key: read/write on that one bucket only (printed once by scripts/garage-setup.sh). */
  get S3_ACCESS_KEY_ID() {
    return read("S3_ACCESS_KEY_ID");
  },
  get S3_SECRET_ACCESS_KEY() {
    return read("S3_SECRET_ACCESS_KEY");
  },
  get S3_FORCE_PATH_STYLE() {
    return read("S3_FORCE_PATH_STYLE");
  },

  /** Sender of every e-mail, e.g. "HoReCa Marketplace <no-reply@…>". */
  get EMAIL_FROM() {
    return read("EMAIL_FROM");
  },
  /** SMTP server (Mailpit in every environment), e.g. smtp://127.0.0.1:1025. Required by the worker. */
  get SMTP_URL() {
    return read("SMTP_URL");
  },

  /** mock-services gateway base URL as seen from web and worker (decision 012 §6). */
  get PAYMENT_GATEWAY_URL() {
    return read("PAYMENT_GATEWAY_URL");
  },
  get PAYMENT_GATEWAY_API_KEY() {
    return read("PAYMENT_GATEWAY_API_KEY");
  },
  /** HMAC-SHA256 secret for payment callbacks (shared with mock-services). */
  get PAYMENT_WEBHOOK_SECRET() {
    return read("PAYMENT_WEBHOOK_SECRET");
  },
  /** mock-services supplier stock API base URL (decision 012 §7). */
  get SUPPLIER_API_URL() {
    return read("SUPPLIER_API_URL");
  },
  /** Sent by web and worker as `Authorization: Bearer …`; mock-services checks it. */
  get SUPPLIER_API_KEY() {
    return read("SUPPLIER_API_KEY");
  },

  /** mock-services only: listen port (4010). */
  get MOCK_SERVICES_PORT() {
    return read("MOCK_SERVICES_PORT");
  },
  /** mock-services only: listen address. */
  get MOCK_SERVICES_HOST() {
    return read("MOCK_SERVICES_HOST");
  },
  /** mock-services only: raw JSON, see src/mock-services/config.ts. */
  get MOCK_SUPPLIER_BEHAVIOUR() {
    return read("MOCK_SUPPLIER_BEHAVIOUR");
  },
  /** mock-services only: quantity for SKUs outside its seed data. */
  get MOCK_DEFAULT_STOCK() {
    return read("MOCK_DEFAULT_STOCK");
  },

  /** AI stretch features; off unless explicitly "true". */
  get AI_ENABLED() {
    return read("AI_ENABLED");
  },
  get ANTHROPIC_API_KEY() {
    return read("ANTHROPIC_API_KEY");
  },
  get ANTHROPIC_MODEL() {
    return read("ANTHROPIC_MODEL");
  },

  /** For code that works without a value (dev tools; health reports "unknown" instead of failing). */
  has(key: Key): boolean {
    return raw(key) !== undefined;
  },
};
