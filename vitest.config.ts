/**
 * Vitest (D2-B1). Two groups:
 *   pnpm test              unit tests next to the code: src/**\/*.test.ts (no database)
 *   pnpm test:integration  = vitest run --mode integration → tests/integration/** (real Postgres;
 *                          Testcontainers from D3-B1). `--mode` instead of an env variable, so the
 *                          script works the same on Windows, macOS and Linux.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const integration = mode === "integration";
  if (integration) {
    try {
      process.loadEnvFile(".env");
    } catch {
      /* CI sets the variables itself */
    }
  }
  return {
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      include: integration
        ? ["tests/integration/**/*.test.ts"]
        : ["src/**/*.test.ts"],
      environment: "node",
      // Integration tests share one database: run files one after another.
      fileParallelism: !integration,
      testTimeout: integration ? 30_000 : 5_000,
      // D2-B1 has no unit tests yet (money.ts arrives with D2-B3).
      passWithNoTests: true,
    },
  };
});
