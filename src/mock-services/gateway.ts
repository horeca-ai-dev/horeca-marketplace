/**
 * Mock card gateway — NOT BUILT YET. This file reserves the `/gateway/` prefix inside mock-services.
 *
 * D10-B3 adds here: POST /gateway/payments, GET /gateway/payments/{id}, refunds, the signed callback
 * (HMAC-SHA256, retry) and the admin "replay last callback"; D10-A3 the hosted card page
 * (decision 012 §6). It gets its own key (PAYMENT_GATEWAY_API_KEY) — the supplier API key does not
 * apply under /gateway/.
 */
import { problem, type ApiResponse } from "./response";

export function handleGateway(): ApiResponse {
  return problem(404, "Not found", "The mock card gateway is not built yet.");
}
