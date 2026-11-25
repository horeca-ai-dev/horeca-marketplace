/**
 * Seed entry point (D3-B1) — `pnpm db:seed` locally; on the server `node dist/seed.mjs` from the same image.
 * Like src/migrate.ts: exits with code 1 on any failure. Safe to run again (it only adds what is missing).
 *
 * Creates the category tree and attribute definitions, the platform organization with its admin,
 * three approved demo suppliers, two buyers and the multi-organization user (README → Demo accounts).
 * Production refuses to run without a real SEED_DEMO_PASSWORD.
 */
import { assertEnv, env } from "@/env.core";
import { closeDb } from "@/server/db/client";
import { runSeed } from "@/server/db/seed/run";
import { getLogger } from "@/server/logger";

const log = getLogger("seed");

async function main() {
  assertEnv("seed");
  const result = await runSeed({
    appEnv: env.APP_ENV,
    password: env.SEED_DEMO_PASSWORD,
  });
  // What was ADDED this run — all zeros on a repeat.
  log.info(result, "seed done");
}

main()
  .catch((err: unknown) => {
    log.fatal({ err }, "seed failed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
