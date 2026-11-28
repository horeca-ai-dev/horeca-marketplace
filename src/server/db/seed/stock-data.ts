/**
 * Starting stock of the demo suppliers (D6-A3) — the ONE list of demo SKUs and their quantities.
 *
 * Two readers:
 *   - `mock-services` (src/mock-services.ts) loads it into memory on start: it plays the suppliers' own
 *     stock systems and never reads our database (decision 012 §7–§8);
 *   - the generated product seed (D8-A3) creates the products with these SKUs, so the catalogue and the
 *     mock agree.
 *
 * Pure data: this file (like demo-data.ts) must not import the database client — it is bundled into
 * the mock-services entry.
 *
 * Keys are DEMO_ORGS keys (demo-data.ts). A product that is not listed here (created by hand or by a
 * CSV import) still gets an answer from the mock: its default quantity (MOCK_DEFAULT_STOCK).
 */
import { DEMO_ORGS, demoOrgSlug } from "./demo-data";

export type StockSeedLine = {
  sku: string;
  /** Units available when mock-services starts. 0 = out of stock from the start. */
  startingQty: number;
};

export const DEMO_STOCK: Record<string, StockSeedLine[]> = {
  // Gastro Oprema — kitchen equipment: few pieces of expensive items.
  "supplier-a": [
    { sku: "GO-1001", startingQty: 4 },
    { sku: "GO-1002", startingQty: 2 },
    { sku: "GO-1003", startingQty: 12 },
    { sku: "GO-1004", startingQty: 25 },
    { sku: "GO-1005", startingQty: 8 },
    { sku: "GO-1006", startingQty: 0 },
  ],
  // Stolni Servis — tableware: large quantities.
  "supplier-b": [
    { sku: "SS-2001", startingQty: 480 },
    { sku: "SS-2002", startingQty: 360 },
    { sku: "SS-2003", startingQty: 1200 },
    { sku: "SS-2004", startingQty: 96 },
    { sku: "SS-2005", startingQty: 3 },
    { sku: "SS-2006", startingQty: 0 },
  ],
  // Hotel Tekstil — textiles.
  "supplier-c": [
    { sku: "HT-3001", startingQty: 150 },
    { sku: "HT-3002", startingQty: 200 },
    { sku: "HT-3003", startingQty: 60 },
    { sku: "HT-3004", startingQty: 40 },
    { sku: "HT-3005", startingQty: 5 },
    { sku: "HT-3006", startingQty: 0 },
  ],
  "multi-supplier": [
    { sku: "MT-4001", startingQty: 30 },
    { sku: "MT-4002", startingQty: 10 },
  ],
};

/**
 * The stock keyed the way the supplier stock API addresses a supplier: by its EXTERNAL CODE, which is
 * the organization slug (`demo-supplier-a`). Organization ids are random per database, so they cannot
 * be known to an external system; the slug is the same in every environment.
 */
export function demoStockByExternalCode(): Record<string, StockSeedLine[]> {
  const out: Record<string, StockSeedLine[]> = {};
  for (const org of DEMO_ORGS) {
    if (org.type !== "supplier") continue;
    out[demoOrgSlug(org.key)] = DEMO_STOCK[org.key] ?? [];
  }
  return out;
}
