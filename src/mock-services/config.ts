/**
 * Behaviour of the mock supplier stock API per supplier (D6-A3, decision 012 §7).
 *
 * MOCK_SUPPLIER_BEHAVIOUR is one JSON object: supplier external code → behaviour. A supplier that is
 * not listed behaves normally. Example:
 *
 *   {"demo-supplier-b":{"mode":"down"},
 *    "demo-supplier-c":{"mode":"out_of_stock","skus":["HT-3001","HT-3002"]}}
 *
 *   normal        answers from its stock
 *   down          503 on every request for that supplier (stock and orders, repeated orders too)
 *   out_of_stock  the listed SKUs have 0 available; the rest is normal
 *
 * Read once at start: changing it means restarting the container (which also resets the stock).
 */
import { z } from "zod";

/** A supplier's external code = its organization slug. */
export const supplierCodeSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, "is not a valid supplier code");

/** No commas (the stock query is comma-separated) and no control characters. */
export const skuSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[^,\p{Cc}]+$/u, "must not contain commas or control characters");

const behaviourSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("normal") }),
  z.strictObject({ mode: z.literal("down") }),
  z.strictObject({
    mode: z.literal("out_of_stock"),
    skus: z.array(skuSchema).min(1).max(500),
  }),
]);

const configSchema = z.record(supplierCodeSchema, behaviourSchema);

export type SupplierBehaviour = z.infer<typeof behaviourSchema>;
export type BehaviourConfig = Record<string, SupplierBehaviour>;

const NORMAL: SupplierBehaviour = { mode: "normal" };

/** Throws an Error that says what is wrong; the entry point refuses to start on it. */
export function parseBehaviourConfig(json: string): BehaviourConfig {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("MOCK_SUPPLIER_BEHAVIOUR is not valid JSON");
  }
  const parsed = configSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      `MOCK_SUPPLIER_BEHAVIOUR is invalid: ${z.prettifyError(parsed.error)}`,
    );
  return parsed.data;
}

export function behaviourOf(
  config: BehaviourConfig,
  supplier: string,
): SupplierBehaviour {
  // Object.hasOwn: a supplier code like "constructor" must not find Object.prototype members.
  return Object.hasOwn(config, supplier) ? config[supplier]! : NORMAL;
}
