/** Handlers and state of the mock supplier stock API — no sockets (the HTTP test is http.test.ts). */
import { describe, expect, it } from "vitest";
import type { BehaviourConfig } from "./config";
import { createStockStore, type OrderResult } from "./stock-store";
import { getStock, postOrder, type SupplierApiDeps } from "./supplier-api";

const T0 = new Date("2026-12-01T08:00:00.000Z");
const T1 = new Date("2026-12-01T09:30:00.000Z");

function setup(behaviour: BehaviourConfig = {}) {
  const clock = { now: T0 };
  const deps: SupplierApiDeps = {
    behaviour,
    store: createStockStore({
      seed: {
        "sup-a": [
          { sku: "A-1", startingQty: 10 },
          { sku: "A-2", startingQty: 2 },
          { sku: "A-0", startingQty: 0 },
        ],
        "sup-b": [{ sku: "B-1", startingQty: 5 }],
      },
      defaultQty: 100,
      behaviour,
      now: () => clock.now,
    }),
  };
  const available = (supplier: string, sku: string) =>
    deps.store.read(supplier, [sku])[0]!.available;
  return { deps, clock, available };
}

const order = (subOrderId: string, lines: [string, number][]) => ({
  subOrderId,
  lines: lines.map(([sku, qty]) => ({ sku, qty })),
});

describe("GET stock", () => {
  it("returns the seeded quantities in the order asked", () => {
    const { deps } = setup();
    const res = getStock(deps, "sup-a", "A-2,A-1,A-0");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { sku: "A-2", available: 2, updatedAt: T0.toISOString() },
      { sku: "A-1", available: 10, updatedAt: T0.toISOString() },
      { sku: "A-0", available: 0, updatedAt: T0.toISOString() },
    ]);
  });

  it("answers the default quantity for an unknown SKU and an unknown supplier", () => {
    const { deps } = setup();
    expect(getStock(deps, "sup-a", "NEW-1").body).toEqual([
      { sku: "NEW-1", available: 100, updatedAt: T0.toISOString() },
    ]);
    expect(getStock(deps, "created-by-admin", "X").body).toEqual([
      { sku: "X", available: 100, updatedAt: T0.toISOString() },
    ]);
  });

  it("keeps suppliers apart: the same SKU is another supplier's own stock", () => {
    const { deps } = setup();
    expect(getStock(deps, "sup-b", "A-1").body).toMatchObject([
      { sku: "A-1", available: 100 },
    ]);
  });

  it("answers a repeated SKU once", () => {
    const { deps } = setup();
    expect(getStock(deps, "sup-a", "A-1,A-1,").body).toHaveLength(1);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["only commas", ",,"],
    ["a SKU longer than 64 characters", "x".repeat(65)],
    [
      "more than 200 SKUs",
      Array.from({ length: 201 }, (_, i) => `S-${i}`).join(","),
    ],
  ])("is 422 when skus is %s", (_name, skus) => {
    const res = getStock(setup().deps, "sup-a", skus);
    expect(res.status).toBe(422);
    expect(res.contentType).toBe("application/problem+json");
  });

  it("is 404 for a supplier code that cannot be a slug", () => {
    expect(getStock(setup().deps, "../etc", "A-1").status).toBe(404);
  });
});

describe("POST orders", () => {
  it("accepts an order and decrements every line", () => {
    const { deps, clock, available } = setup();
    clock.now = T1;
    const res = postOrder(
      deps,
      "sup-a",
      order("so-1", [
        ["A-1", 3],
        ["A-2", 2],
      ]),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      subOrderId: "so-1",
      status: "accepted",
      lines: [
        { sku: "A-1", qty: 3, status: "ok" },
        { sku: "A-2", qty: 2, status: "ok" },
      ],
    });
    expect(getStock(deps, "sup-a", "A-1,A-2").body).toEqual([
      { sku: "A-1", available: 7, updatedAt: T1.toISOString() },
      { sku: "A-2", available: 0, updatedAt: T1.toISOString() },
    ]);
    expect(available("sup-b", "B-1")).toBe(5);
  });

  it("is idempotent: the same request gets the same answer and no second decrement", () => {
    const { deps, available } = setup();
    const first = postOrder(
      deps,
      "sup-a",
      order("so-1", [
        ["A-1", 3],
        ["A-2", 1],
      ]),
    );
    // Same lines in another order = the same request.
    const again = postOrder(
      deps,
      "sup-a",
      order("so-1", [
        ["A-2", 1],
        ["A-1", 3],
      ]),
    );
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(available("sup-a", "A-1")).toBe(7);
    expect(available("sup-a", "A-2")).toBe(1);
  });

  it("is 409 when the same subOrderId comes with different lines", () => {
    const { deps, available } = setup();
    postOrder(deps, "sup-a", order("so-1", [["A-1", 3]]));
    const res = postOrder(deps, "sup-a", order("so-1", [["A-1", 4]]));
    expect(res.status).toBe(409);
    expect(available("sup-a", "A-1")).toBe(7);
  });

  it("scopes the subOrderId to the supplier", () => {
    const { deps, available } = setup();
    postOrder(deps, "sup-a", order("so-1", [["A-1", 1]]));
    const res = postOrder(deps, "sup-b", order("so-1", [["B-1", 2]]));
    expect((res.body as OrderResult).status).toBe("accepted");
    expect(available("sup-b", "B-1")).toBe(3);
  });

  it("rejects all-or-nothing: one short line, nothing decremented, reason per line", () => {
    const { deps, available } = setup();
    const res = postOrder(
      deps,
      "sup-a",
      order("so-1", [
        ["A-1", 3],
        ["A-2", 5],
        ["A-0", 1],
      ]),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      subOrderId: "so-1",
      status: "rejected",
      lines: [
        { sku: "A-1", qty: 3, status: "ok" },
        {
          sku: "A-2",
          qty: 5,
          status: "rejected",
          reason: "insufficient_stock",
          available: 2,
        },
        {
          sku: "A-0",
          qty: 1,
          status: "rejected",
          reason: "insufficient_stock",
          available: 0,
        },
      ],
    });
    expect(available("sup-a", "A-1")).toBe(10);
    expect(available("sup-a", "A-2")).toBe(2);
  });

  it("remembers a rejection: asking again gives the same answer", () => {
    const { deps } = setup();
    const first = postOrder(deps, "sup-a", order("so-1", [["A-2", 5]]));
    const again = postOrder(deps, "sup-a", order("so-1", [["A-2", 5]]));
    expect(again.body).toEqual(first.body);
    expect((again.body as OrderResult).status).toBe("rejected");
  });

  it("sells stock down to zero and then rejects", () => {
    const { deps } = setup();
    const status = (id: string) =>
      (postOrder(deps, "sup-a", order(id, [["A-2", 1]])).body as OrderResult)
        .status;
    expect([status("so-1"), status("so-2"), status("so-3")]).toEqual([
      "accepted",
      "accepted",
      "rejected",
    ]);
  });

  it("decrements a SKU outside the seed from the default quantity", () => {
    const { deps, available } = setup();
    postOrder(deps, "sup-a", order("so-1", [["NEW-1", 40]]));
    expect(available("sup-a", "NEW-1")).toBe(60);
    expect(available("sup-b", "NEW-1")).toBe(100);
  });

  it.each([
    ["no body", undefined],
    ["no lines", { subOrderId: "so-1", lines: [] }],
    ["a missing subOrderId", { lines: [{ sku: "A-1", qty: 1 }] }],
    ["qty 0", order("so-1", [["A-1", 0]])],
    ["a negative qty", order("so-1", [["A-1", -1]])],
    ["a fractional qty", order("so-1", [["A-1", 1.5]])],
    [
      "qty as a string",
      { subOrderId: "so-1", lines: [{ sku: "A-1", qty: "1" }] },
    ],
    [
      "the same SKU twice",
      order("so-1", [
        ["A-1", 1],
        ["A-1", 2],
      ]),
    ],
    ["an unknown key", { ...order("so-1", [["A-1", 1]]), supplierId: "sup-b" }],
    [
      "an unknown key in a line",
      { subOrderId: "so-1", lines: [{ sku: "A-1", qty: 1, price: 1 }] },
    ],
  ])("is 422 for %s and changes nothing", (_name, body) => {
    const { deps, available } = setup();
    const res = postOrder(deps, "sup-a", body);
    expect(res.status).toBe(422);
    expect(available("sup-a", "A-1")).toBe(10);
  });
});

describe("behaviour per supplier", () => {
  it("down: 503 on stock and orders, other suppliers work", () => {
    const { deps } = setup({ "sup-a": { mode: "down" } });
    expect(getStock(deps, "sup-a", "A-1").status).toBe(503);
    expect(postOrder(deps, "sup-a", order("so-1", [["A-1", 1]])).status).toBe(
      503,
    );
    expect(getStock(deps, "sup-b", "B-1").status).toBe(200);
  });

  it("down wins over invalid input: nothing about the request is checked", () => {
    const { deps } = setup({ "sup-a": { mode: "down" } });
    expect(getStock(deps, "sup-a", null).status).toBe(503);
  });

  it("out_of_stock: the listed SKUs are 0 and cannot be ordered, the rest is normal", () => {
    const { deps, available } = setup({
      "sup-a": { mode: "out_of_stock", skus: ["A-1", "NEW-1"] },
    });
    expect(getStock(deps, "sup-a", "A-1,NEW-1,A-2").body).toMatchObject([
      { sku: "A-1", available: 0 },
      { sku: "NEW-1", available: 0 },
      { sku: "A-2", available: 2 },
    ]);
    const res = postOrder(
      deps,
      "sup-a",
      order("so-1", [
        ["A-1", 1],
        ["A-2", 1],
      ]),
    );
    expect(res.body).toMatchObject({
      status: "rejected",
      lines: [
        { sku: "A-1", status: "rejected", reason: "insufficient_stock" },
        { sku: "A-2", status: "ok" },
      ],
    });
    expect(available("sup-a", "A-2")).toBe(2);
    // The same SKU at another supplier is not affected.
    expect(available("sup-b", "A-1")).toBe(100);
  });
});
