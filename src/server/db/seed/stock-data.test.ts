/** The demo stock list is consistent with the demo organizations — no database needed. */
import { describe, expect, it } from "vitest";
import { DEMO_ORGS } from "./demo-data";
import { DEMO_STOCK, demoStockByExternalCode } from "./stock-data";

const supplierKeys = DEMO_ORGS.filter((o) => o.type === "supplier").map(
  (o) => o.key,
);

describe("demo stock data", () => {
  it("lists stock for every demo supplier and for nobody else", () => {
    expect(Object.keys(DEMO_STOCK).sort()).toEqual([...supplierKeys].sort());
    for (const key of supplierKeys)
      expect(DEMO_STOCK[key]!.length).toBeGreaterThan(0);
  });

  it("has valid, unique SKUs and whole, non-negative quantities", () => {
    const all = Object.values(DEMO_STOCK).flat();
    expect(new Set(all.map((l) => l.sku)).size).toBe(all.length);
    for (const line of all) {
      expect(line.sku).toMatch(/^[A-Z]{2}-\d{4}$/);
      expect(Number.isInteger(line.startingQty)).toBe(true);
      expect(line.startingQty).toBeGreaterThanOrEqual(0);
    }
  });

  it("is keyed by the organization slug for the stock API", () => {
    const byCode = demoStockByExternalCode();
    expect(Object.keys(byCode).sort()).toEqual(
      supplierKeys.map((k) => `demo-${k}`).sort(),
    );
    expect(byCode["demo-supplier-a"]).toBe(DEMO_STOCK["supplier-a"]);
  });
});
