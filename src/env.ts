/**
 * Configuration for Next.js-only code (src/app, src/components, src/instrumentation.ts).
 *
 * Same API as src/env.core.ts — this file only adds `server-only`, so importing configuration from a
 * Client Component fails the build. Code that plain Node also loads (worker, migrate, drizzle-kit,
 * Vitest, and the src/server modules they reach) imports src/env.core.ts instead, because
 * `server-only` throws outside Next.js. See the header of env.core.ts.
 */
import "server-only";

export { assertEnv, env, type EnvRole } from "./env.core";
