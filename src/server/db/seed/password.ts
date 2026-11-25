/**
 * Which password the seeded demo accounts get (D3-B1).
 *
 * Local and staging: `SEED_DEMO_PASSWORD`, or the README's demo password when it is not set.
 * Production: the seed REFUSES to run unless a real password is configured — a published demo
 * password on a reachable server would be an open door. The messages never contain the password.
 */
export const README_DEMO_PASSWORD = "Demo-1234!";
export const PRODUCTION_MIN_PASSWORD_LENGTH = 12;

export function resolveSeedPassword(
  appEnv: "local" | "staging" | "production",
  configured: string | undefined,
): string {
  if (appEnv !== "production") return configured ?? README_DEMO_PASSWORD;

  if (!configured) {
    throw new Error(
      "Refusing to seed production: SEED_DEMO_PASSWORD is not set.",
    );
  }
  if (configured === README_DEMO_PASSWORD) {
    throw new Error(
      "Refusing to seed production: SEED_DEMO_PASSWORD is the demo password from the README.",
    );
  }
  if (configured.length < PRODUCTION_MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Refusing to seed production: SEED_DEMO_PASSWORD must have at least ${PRODUCTION_MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  return configured;
}
