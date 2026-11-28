/**
 * mock-services over real HTTP (D6-A3): the server listens on a random free port on 127.0.0.1 and the
 * test talks to it with fetch — routing, the API key, bodies, status codes and headers.
 * No database and no container: mock-services has neither.
 */
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLogger } from "@/server/logger";
import { createMockServer, MAX_BODY_BYTES } from "./http";
import { createStockStore } from "./stock-store";

const KEY = "http-test-supplier-key";
const behaviour = { "sup-down": { mode: "down" as const } };

const logged: string[] = [];
const server = createMockServer({
  supplierApiKey: KEY,
  behaviour,
  store: createStockStore({
    seed: { "sup-a": [{ sku: "A-1", startingQty: 10 }] },
    defaultQty: 100,
    behaviour,
  }),
  log: createLogger({
    level: "debug",
    destination: new Writable({
      write(chunk: Buffer, _encoding, done) {
        logged.push(chunk.toString());
        done();
      },
    }),
  }),
});

let base = "";
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const auth = { Authorization: `Bearer ${KEY}` };
const call = (path: string, init?: RequestInit) => fetch(base + path, init);
const postOrder = (
  supplier: string,
  body: unknown,
  headers: HeadersInit = auth,
) =>
  call(`/suppliers/${supplier}/orders`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("mock-services over HTTP", () => {
  it("GET /health answers without a key", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("refuses the supplier API without the key, with a wrong key, and says nothing else", async () => {
    const bad: Record<string, string>[] = [
      {},
      { Authorization: "Bearer wrong" },
    ];
    for (const headers of bad) {
      const stock = await call("/suppliers/sup-a/stock?skus=A-1", { headers });
      expect(stock.status).toBe(401);
      expect(stock.headers.get("content-type")).toMatch(
        /^application\/problem\+json/,
      );
      // Also for a supplier that is down and for invalid input: the key comes first.
      expect(
        (await call("/suppliers/sup-down/stock", { headers })).status,
      ).toBe(401);
      const order = await postOrder(
        "sup-a",
        { subOrderId: "x", lines: [{ sku: "A-1", qty: 1 }] },
        headers,
      );
      expect(order.status).toBe(401);
    }
    const stock = await call("/suppliers/sup-a/stock?skus=A-1", {
      headers: auth,
    });
    expect(await stock.json()).toMatchObject([{ sku: "A-1", available: 10 }]);
  });

  it("reads stock, places an order once, and replays it without a second decrement", async () => {
    const body = { subOrderId: "so-http-1", lines: [{ sku: "A-1", qty: 4 }] };
    const first = await postOrder("sup-a", body);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toMatch(/^application\/json/);
    const answer = await first.json();
    expect(answer).toEqual({
      subOrderId: "so-http-1",
      status: "accepted",
      lines: [{ sku: "A-1", qty: 4, status: "ok" }],
    });

    const again = await postOrder("sup-a", body);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(answer);

    const stock = await call("/suppliers/sup-a/stock?skus=A-1,NEW-1", {
      headers: auth,
    });
    expect(stock.status).toBe(200);
    expect(stock.headers.get("cache-control")).toBe("no-store");
    expect(await stock.json()).toMatchObject([
      { sku: "A-1", available: 6 },
      { sku: "NEW-1", available: 100 },
    ]);

    const changed = await postOrder("sup-a", {
      subOrderId: "so-http-1",
      lines: [{ sku: "A-1", qty: 5 }],
    });
    expect(changed.status).toBe(409);
  });

  it("rejects an order that asks for more than there is (200, nothing decremented)", async () => {
    const res = await postOrder("sup-a", {
      subOrderId: "so-http-2",
      lines: [{ sku: "A-1", qty: 999 }],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "rejected",
      lines: [{ sku: "A-1", status: "rejected", reason: "insufficient_stock" }],
    });
  });

  it("answers 503 for a supplier that is down", async () => {
    const stock = await call("/suppliers/sup-down/stock?skus=A-1", {
      headers: auth,
    });
    expect(stock.status).toBe(503);
    const order = await postOrder("sup-down", {
      subOrderId: "so-http-3",
      lines: [{ sku: "A-1", qty: 1 }],
    });
    expect(order.status).toBe(503);
  });

  it("maps bad requests: 400 broken JSON, 422 invalid, 413 too large, 405 wrong method, 404 unknown", async () => {
    expect((await postOrder("sup-a", "{not json")).status).toBe(400);
    expect(
      (await postOrder("sup-a", { subOrderId: "x", lines: [] })).status,
    ).toBe(422);
    expect(
      (await call("/suppliers/sup-a/stock", { headers: auth })).status,
    ).toBe(422);

    const big = await postOrder("sup-a", {
      subOrderId: "x",
      lines: [{ sku: "A-1", qty: 1 }],
      padding: "x".repeat(MAX_BODY_BYTES),
    });
    expect(big.status).toBe(413);

    const wrongMethod = await call("/suppliers/sup-a/stock?skus=A-1", {
      method: "DELETE",
      headers: auth,
    });
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("GET");
    expect(
      (await call("/suppliers/sup-a/orders", { headers: auth })).status,
    ).toBe(405);

    expect((await call("/nothing")).status).toBe(404);
    expect((await call("/suppliers/sup-a", { headers: auth })).status).toBe(
      404,
    );
    expect(
      (await call("/suppliers/sup%2Fa/stock?skus=A-1", { headers: auth }))
        .status,
    ).toBe(404);
  });

  it("keeps /gateway/ reserved for the card gateway (not built yet)", async () => {
    const res = await call("/gateway/payments", {
      method: "POST",
      headers: auth,
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ status: 404 });
  });

  it("logs one line per request with the path and status — never the key", () => {
    const lines = logged.join("");
    expect(lines).toContain('"path":"/suppliers/sup-a/stock"');
    expect(lines).toContain('"status":401');
    expect(lines).not.toContain(KEY);
    expect(lines).not.toContain("authorization");
  });
});
