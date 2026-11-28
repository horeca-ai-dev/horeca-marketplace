/**
 * Handlers of the mock supplier stock API (D6-A3, decision 012 §7). Plain functions: input in,
 * `ApiResponse` out — no sockets, so the unit tests call them directly.
 *
 *   GET  /suppliers/{code}/stock?skus=a,b,c   → 200 [{ sku, available, updatedAt }]
 *   POST /suppliers/{code}/orders             → 200 { subOrderId, status, lines }
 *        { subOrderId, lines: [{ sku, qty }] }
 *
 * {code} is the supplier's EXTERNAL CODE (= its organization slug, e.g. demo-supplier-a).
 *
 * An order is answered 200 both when ACCEPTED and when REJECTED: a rejection is the supplier's
 * business answer, not a failure of the call. Non-2xx means "no answer" (401, 409, 422, 503).
 * Idempotent by (supplier, subOrderId): the same request gets the same answer and stock is
 * decremented once; the same subOrderId with different lines is 409.
 */
import { z } from "zod";
import {
  behaviourOf,
  skuSchema,
  supplierCodeSchema,
  type BehaviourConfig,
} from "./config";
import { json, problem, type ApiResponse } from "./response";
import type { StockStore } from "./stock-store";

export const MAX_SKUS_PER_REQUEST = 200;

export type SupplierApiDeps = { store: StockStore; behaviour: BehaviourConfig };

const skusQuerySchema = z
  .array(skuSchema)
  .min(1, "at least one SKU is required")
  .max(MAX_SKUS_PER_REQUEST);

const orderSchema = z.strictObject({
  subOrderId: z.string().min(1).max(64),
  lines: z
    .array(
      z.strictObject({
        sku: skuSchema,
        qty: z.number().int().min(1).max(1_000_000),
      }),
    )
    .min(1)
    .max(MAX_SKUS_PER_REQUEST)
    .refine((lines) => new Set(lines.map((l) => l.sku)).size === lines.length, {
      message: "each SKU may appear once",
    }),
});

function invalid(error: z.ZodError): ApiResponse {
  return problem(422, "Invalid input", undefined, {
    errors: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

/** Shared start of both handlers: a valid code, and a supplier whose system is up. */
function unavailable(
  deps: SupplierApiDeps,
  supplier: string,
): ApiResponse | null {
  if (!supplierCodeSchema.safeParse(supplier).success)
    return problem(404, "Not found");
  if (behaviourOf(deps.behaviour, supplier).mode === "down")
    return problem(
      503,
      "Service unavailable",
      "The supplier's stock system is down.",
    );
  return null;
}

export function getStock(
  deps: SupplierApiDeps,
  supplier: string,
  skusParam: string | null,
): ApiResponse {
  const stop = unavailable(deps, supplier);
  if (stop) return stop;

  // The same SKU twice is answered once.
  const skus = [...new Set((skusParam ?? "").split(",").filter(Boolean))];
  const parsed = skusQuerySchema.safeParse(skus);
  if (!parsed.success) return invalid(parsed.error);

  return json(200, deps.store.read(supplier, parsed.data));
}

export function postOrder(
  deps: SupplierApiDeps,
  supplier: string,
  body: unknown,
): ApiResponse {
  const stop = unavailable(deps, supplier);
  if (stop) return stop;

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const outcome = deps.store.placeOrder(
    supplier,
    parsed.data.subOrderId,
    parsed.data.lines,
  );
  if (outcome.kind === "conflict")
    return problem(
      409,
      "Conflict",
      "This subOrderId was already answered for different lines.",
    );
  return json(200, outcome.result);
}
