/**
 * mock-services entry point (D6-A3) — `pnpm mock:dev` locally, the `mock-services` container on the
 * server (the fourth entry of the image: `node dist/mock-services.mjs`).
 *
 * It plays the systems OUTSIDE our platform (decision 012 §6–§8):
 *   - the suppliers' stock systems  → /suppliers/{code}/stock, /suppliers/{code}/orders   (built)
 *   - the card gateway              → /gateway/…                                          (D10-B3)
 *
 * No database: state is in memory, seeded on start from src/server/db/seed/stock-data.ts and reset by
 * a restart. Configuration: SUPPLIER_API_KEY, MOCK_SERVICES_PORT / _HOST, MOCK_SUPPLIER_BEHAVIOUR,
 * MOCK_DEFAULT_STOCK (README → Environment variables).
 */
import { assertEnv, env } from "@/env.core";
import {
  parseBehaviourConfig,
  type BehaviourConfig,
} from "@/mock-services/config";
import { createMockServer } from "@/mock-services/http";
import { createStockStore } from "@/mock-services/stock-store";
import { demoStockByExternalCode } from "@/server/db/seed/stock-data";
import { getLogger } from "@/server/logger";

const log = getLogger("mock-services");

// Refuse to start with a missing or malformed variable (like the worker).
let behaviour: BehaviourConfig;
try {
  assertEnv("mock-services");
  behaviour = parseBehaviourConfig(env.MOCK_SUPPLIER_BEHAVIOUR);
} catch (err: unknown) {
  log.fatal({ err }, "invalid environment");
  process.exit(1);
}

const seed = demoStockByExternalCode();
const server = createMockServer({
  supplierApiKey: env.SUPPLIER_API_KEY,
  behaviour,
  store: createStockStore({
    seed,
    defaultQty: env.MOCK_DEFAULT_STOCK,
    behaviour,
  }),
  log,
});

server.on("error", (err) => {
  log.fatal({ err }, "failed to start");
  process.exit(1);
});
server.listen(env.MOCK_SERVICES_PORT, env.MOCK_SERVICES_HOST, () => {
  log.info(
    {
      host: env.MOCK_SERVICES_HOST,
      port: env.MOCK_SERVICES_PORT,
      suppliers: Object.keys(seed),
      behaviour,
    },
    "started",
  );
});

let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, "finishing open requests");
  // Stop accepting, let running requests finish, drop idle keep-alive connections.
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  // A client that never finishes must not keep the container alive (Docker kills after 10 s anyway).
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
