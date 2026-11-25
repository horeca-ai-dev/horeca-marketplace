/**
 * The whole seed (D3-B1): catalogue reference data, then the demo users and organizations.
 * Called by the seed entry point (src/seed.ts) and by tests.
 *
 * The password rule is checked FIRST, before any connection is opened — so a refused production
 * seed touches nothing.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env.core";
import * as schema from "../schema";
import { seedCatalogue, type CatalogueSeedResult } from "./catalogue";
import { seedDemo, type DemoSeedResult } from "./demo";
import { resolveSeedPassword } from "./password";

export type SeedOptions = {
  appEnv: "local" | "staging" | "production";
  /** `SEED_DEMO_PASSWORD`; see resolveSeedPassword for what each environment accepts. */
  password: string | undefined;
};

export type SeedResult = CatalogueSeedResult & DemoSeedResult;

export async function runSeed(options: SeedOptions): Promise<SeedResult> {
  const password = resolveSeedPassword(options.appEnv, options.password);

  // horeca_owner: reference rows are not created by a user. (Better Auth uses the app pool itself.)
  const pool = new Pool({
    connectionString: env.DATABASE_MIGRATE_URL,
    application_name: "horeca-seed",
    max: 2,
  });
  try {
    const db = drizzle(pool, { schema });
    const catalogue = await db.transaction((tx) => seedCatalogue(tx));
    const demo = await seedDemo(db, password);
    return { ...catalogue, ...demo };
  } finally {
    await pool.end();
  }
}
