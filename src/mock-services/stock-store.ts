/**
 * In-memory state of the mock supplier stock systems (D6-A3): quantities per (supplier, SKU) and the
 * answers already given per (supplier, sub-order). Everything is lost on restart — on purpose.
 *
 * No I/O and no clock of its own (`now` is passed in), so it is tested as plain functions. Node runs
 * one request handler at a time and nothing here awaits, so "check, then decrement" cannot interleave.
 */
import { behaviourOf, type BehaviourConfig } from "./config";

export type StockLevel = { sku: string; available: number; updatedAt: string };

export type OrderLine = { sku: string; qty: number };

export type OrderLineResult =
  | { sku: string; qty: number; status: "ok" }
  | {
      sku: string;
      qty: number;
      status: "rejected";
      reason: "insufficient_stock";
      /** What the supplier had when it refused. */
      available: number;
    };

export type OrderResult = {
  subOrderId: string;
  /** All-or-nothing: one rejected line rejects the whole order and nothing is decremented. */
  status: "accepted" | "rejected";
  lines: OrderLineResult[];
};

export type PlaceOrderOutcome =
  | { kind: "result"; result: OrderResult; replayed: boolean }
  /** The same subOrderId was already answered for DIFFERENT lines. */
  | { kind: "conflict" };

export type StockStore = {
  read(supplier: string, skus: readonly string[]): StockLevel[];
  placeOrder(
    supplier: string,
    subOrderId: string,
    lines: readonly OrderLine[],
  ): PlaceOrderOutcome;
};

type Entry = { available: number; updatedAt: string };

/** Line order does not matter: [a×1, b×2] and [b×2, a×1] are the same request. */
function fingerprint(lines: readonly OrderLine[]): string {
  return JSON.stringify(
    lines
      .map((l) => [l.sku, l.qty] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

export function createStockStore(options: {
  /** Supplier external code → starting quantities (src/server/db/seed/stock-data.ts). */
  seed: Readonly<
    Record<string, readonly { sku: string; startingQty: number }[]>
  >;
  /** Quantity of a SKU that is not in the seed (a product created by hand or by CSV import). */
  defaultQty: number;
  behaviour: BehaviourConfig;
  now?: () => Date;
}): StockStore {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();

  const stock = new Map<string, Map<string, Entry>>();
  for (const [supplier, lines] of Object.entries(options.seed)) {
    const bySku = new Map<string, Entry>();
    for (const line of lines)
      bySku.set(line.sku, {
        available: line.startingQty,
        updatedAt: startedAt,
      });
    stock.set(supplier, bySku);
  }

  const forcedOut = new Map<string, ReadonlySet<string>>();
  for (const supplier of Object.keys(options.behaviour)) {
    const behaviour = behaviourOf(options.behaviour, supplier);
    if (behaviour.mode === "out_of_stock")
      forcedOut.set(supplier, new Set(behaviour.skus));
  }

  const answers = new Map<
    string,
    { fingerprint: string; result: OrderResult }
  >();

  /** Never stores anything: reading an unknown SKU must not grow the memory. */
  function level(supplier: string, sku: string): Entry {
    if (forcedOut.get(supplier)?.has(sku))
      return { available: 0, updatedAt: startedAt };
    return (
      stock.get(supplier)?.get(sku) ?? {
        available: options.defaultQty,
        updatedAt: startedAt,
      }
    );
  }

  return {
    read(supplier, skus) {
      return skus.map((sku) => ({ sku, ...level(supplier, sku) }));
    },

    placeOrder(supplier, subOrderId, lines) {
      // "\n" cannot appear in a supplier code, so the key is unambiguous.
      const key = `${supplier}\n${subOrderId}`;
      const print = fingerprint(lines);
      const previous = answers.get(key);
      if (previous)
        return previous.fingerprint === print
          ? { kind: "result", result: previous.result, replayed: true }
          : { kind: "conflict" };

      const results: OrderLineResult[] = lines.map((line) => {
        const { available } = level(supplier, line.sku);
        return available >= line.qty
          ? { sku: line.sku, qty: line.qty, status: "ok" }
          : {
              sku: line.sku,
              qty: line.qty,
              status: "rejected",
              reason: "insufficient_stock",
              available,
            };
      });
      const accepted = results.every((r) => r.status === "ok");

      if (accepted) {
        const at = now().toISOString();
        let bySku = stock.get(supplier);
        if (!bySku) {
          bySku = new Map();
          stock.set(supplier, bySku);
        }
        for (const line of lines)
          bySku.set(line.sku, {
            available: level(supplier, line.sku).available - line.qty,
            updatedAt: at,
          });
      }

      const result: OrderResult = {
        subOrderId,
        status: accepted ? "accepted" : "rejected",
        lines: results,
      };
      // A rejection is remembered too: asking again gives the same answer, even if stock changed.
      answers.set(key, { fingerprint: print, result });
      return { kind: "result", result, replayed: false };
    },
  };
}
