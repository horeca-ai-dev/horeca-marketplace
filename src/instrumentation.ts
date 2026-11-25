/**
 * Next.js calls register() once when the server starts, before it handles any request (D2-A4).
 * We use it to validate the environment: a web container with a missing or malformed variable
 * refuses to boot, so the deploy's health check fails before traffic is switched (README →
 * "Environment variables"). `next build` is skipped inside assertEnv().
 */
export async function register() {
  // NEXT_RUNTIME is not configuration: Next.js inlines it per bundle at build time, which only works
  // with this literal spelling (a getter in env.core.ts would not be replaced).
  // eslint-disable-next-line no-restricted-properties
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnv } = await import("@/env");
    assertEnv("web");
  }
}
