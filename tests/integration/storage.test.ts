/**
 * The storage module (D5-B3b) against a real Garage (Testcontainers, tests/integration/global-setup.ts): the
 * S3_* variables point at a throw-away bucket. Nothing is mocked — what is proved here is that the SDK
 * settings (path-style, checksums, timeouts) really work with Garage.
 *
 * Every object lives under `tests/<run>/` and is removed in afterAll.
 */
import { randomBytes } from "node:crypto";
import { buffer, text } from "node:stream/consumers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "@/env.core";
import {
  MAX_PUT_BYTES,
  StorageError,
  createStorage,
  storage,
  type StorageConfig,
} from "@/server/storage";

const run = randomBytes(4).toString("hex");
const prefix = `tests/${run}/`;
const key = (name: string) => `${prefix}${name}`;

const config = (): StorageConfig => ({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail, but it succeeded");
}

/** Runs `fn` for every item, `n` at a time. */
async function inParallel<T>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<void>,
) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (queue.length) await fn(queue.shift()!);
    }),
  );
}

afterAll(async () => {
  // Everything this file wrote, page by page.
  for (;;) {
    const { objects } = await storage.list(prefix, { limit: 1_000 });
    if (objects.length === 0) break;
    await inParallel(objects, 10, (o) => storage.delete(o.key));
  }
});

describe("put / get / head / delete", () => {
  it("stores bytes and reads exactly the same bytes back, with the content type", async () => {
    const bytes = randomBytes(64 * 1024); // binary, not text
    await storage.put(key("image.webp"), bytes, { contentType: "image/webp" });

    const object = await storage.get(key("image.webp"));
    expect(object).not.toBeNull();
    expect(object!.contentType).toBe("image/webp");
    expect(object!.size).toBe(bytes.length);
    expect(Buffer.compare(await buffer(object!.body), bytes)).toBe(0);
  });

  it("accepts a Uint8Array and an empty object", async () => {
    await storage.put(key("u8"), new Uint8Array([1, 2, 3]), {
      contentType: "application/octet-stream",
    });
    expect([...(await buffer((await storage.get(key("u8")))!.body))]).toEqual([
      1, 2, 3,
    ]);

    await storage.put(key("empty"), Buffer.alloc(0), {
      contentType: "text/plain",
    });
    expect((await storage.head(key("empty")))?.size).toBe(0);
  });

  it("keeps UTF-8 text intact (č ć š ž đ)", async () => {
    await storage.put(
      key("text"),
      Buffer.from("Čaša đumbira, žuta šljiva ćevap"),
      {
        contentType: "text/plain; charset=utf-8",
      },
    );
    expect(await text((await storage.get(key("text")))!.body)).toBe(
      "Čaša đumbira, žuta šljiva ćevap",
    );
  });

  it("overwrites an existing key", async () => {
    await storage.put(key("over"), Buffer.from("first"), {
      contentType: "text/plain",
    });
    await storage.put(key("over"), Buffer.from("second"), {
      contentType: "text/plain",
    });
    expect(await text((await storage.get(key("over")))!.body)).toBe("second");
  });

  it("head returns size, type and date without reading the body", async () => {
    await storage.put(key("head.pdf"), Buffer.from("%PDF-1.4"), {
      contentType: "application/pdf",
    });
    const info = await storage.head(key("head.pdf"));
    expect(info).toMatchObject({
      key: key("head.pdf"),
      size: 8,
      contentType: "application/pdf",
    });
    expect(info!.lastModified).toBeInstanceOf(Date);
  });

  it("a missing object is null for get and head — not an error", async () => {
    expect(await storage.get(key("nope"))).toBeNull();
    expect(await storage.head(key("nope"))).toBeNull();
  });

  it("delete removes the object, and deleting it again is fine", async () => {
    await storage.put(key("gone"), Buffer.from("x"), {
      contentType: "text/plain",
    });
    await storage.delete(key("gone"));
    expect(await storage.head(key("gone"))).toBeNull();
    await expect(storage.delete(key("gone"))).resolves.toBeUndefined();
    await expect(storage.delete(key("never-existed"))).resolves.toBeUndefined();
  });

  it("refuses bad keys before any request is made", async () => {
    for (const bad of ["../x", "/abs", "a b", "", `${prefix}..`]) {
      for (const call of [
        () => storage.put(bad, Buffer.from("x"), { contentType: "text/plain" }),
        () => storage.get(bad),
        () => storage.head(bad),
        () => storage.delete(bad),
      ]) {
        await expect(call()).rejects.toThrow("Invalid storage key.");
      }
    }
    await expect(storage.list("")).rejects.toThrow("Invalid storage key.");
  });

  it("refuses an absurdly large buffer (programming error guard)", async () => {
    const huge = Buffer.alloc(MAX_PUT_BYTES + 1);
    await expect(
      storage.put(key("huge"), huge, {
        contentType: "application/octet-stream",
      }),
    ).rejects.toThrow("too large");
    expect(await storage.head(key("huge"))).toBeNull();
  });
});

describe("list", () => {
  const lp = `${prefix}list/`;
  beforeAll(async () => {
    await inParallel(["a", "b", "c", "d", "e"], 5, (n) =>
      storage.put(`${lp}${n}`, Buffer.from(n), { contentType: "text/plain" }),
    );
    await storage.put(`${prefix}other/x`, Buffer.from("x"), {
      contentType: "text/plain",
    });
  });

  it("lists the objects under a prefix, in key order, with sizes", async () => {
    const { objects, truncated } = await storage.list(lp);
    expect(objects.map((o) => o.key)).toEqual(
      ["a", "b", "c", "d", "e"].map((n) => `${lp}${n}`),
    );
    expect(objects.every((o) => o.size === 1)).toBe(true);
    expect(truncated).toBe(false);
  });

  it("does not return objects of another prefix", async () => {
    expect((await storage.list(`${prefix}other/`)).objects).toHaveLength(1);
    expect((await storage.list(`${prefix}nothing/`)).objects).toEqual([]);
  });

  it("a prefix without a trailing slash matches by key start", async () => {
    expect((await storage.list(`${lp}c`)).objects.map((o) => o.key)).toEqual([
      `${lp}c`,
    ]);
  });

  it("limit: says when there is more, and is exact when there is not", async () => {
    const two = await storage.list(lp, { limit: 2 });
    expect(two.objects).toHaveLength(2);
    expect(two.truncated).toBe(true);
    const exact = await storage.list(lp, { limit: 5 });
    expect(exact.objects).toHaveLength(5);
    expect(exact.truncated).toBe(false);
    const more = await storage.list(lp, { limit: 4 });
    expect(more.truncated).toBe(true);
  });

  it("follows the continuation token past S3's 1,000-keys page", async () => {
    const bp = `${prefix}many/`;
    const names = Array.from({ length: 1_030 }, (_, i) =>
      String(i).padStart(4, "0"),
    );
    await inParallel(names, 25, (n) =>
      storage.put(`${bp}${n}`, Buffer.alloc(0), { contentType: "text/plain" }),
    );
    const all = await storage.list(bp, { limit: 5_000 });
    expect(all.objects).toHaveLength(1_030);
    expect(all.truncated).toBe(false);
    expect(all.objects[0]!.key).toBe(`${bp}0000`);
    expect(all.objects.at(-1)!.key).toBe(`${bp}1029`);
    // The default limit (1,000) cuts and says so.
    const capped = await storage.list(bp);
    expect(capped.objects).toHaveLength(1_000);
    expect(capped.truncated).toBe(true);
  }, 120_000);
});

describe("ping and failures", () => {
  it("ping succeeds for a reachable bucket with our key", async () => {
    await expect(storage.ping()).resolves.toBeUndefined();
  });

  it("a wrong secret is a StorageError, never an exception from the SDK, and never a leak", async () => {
    const bad = createStorage({
      ...config(),
      secretAccessKey: "wrong-wrong-wrong-wrong",
    });
    const error = await failure(
      bad.put(key("x"), Buffer.from("x"), { contentType: "text/plain" }),
    );
    expect(error).toBeInstanceOf(StorageError);
    expect((error as StorageError).operation).toBe("put");
    const message = (error as StorageError).message;
    for (const secret of [
      env.S3_BUCKET,
      env.S3_ENDPOINT,
      env.S3_ACCESS_KEY_ID,
      key("x"),
    ]) {
      expect(message).not.toContain(secret);
    }
    // The message is fixed text: the SDK's own message (which could carry anything) stays in `cause`, for the log.
    expect(message).toBe("Storage put failed.");
    expect((error as StorageError).cause).toBeDefined();
    await expect(bad.ping()).rejects.toBeInstanceOf(StorageError);
  });

  it("a missing BUCKET is an error, not 'object not found'", async () => {
    const lost = createStorage({
      ...config(),
      bucket: `no-such-bucket-${run}`,
    });
    expect(await failure(lost.get(key("x")))).toBeInstanceOf(StorageError);
    // HEAD has no body: a missing bucket and a missing object are the same 404 (documented on `head`).
    expect(await lost.head(key("x"))).toBeNull();
    expect(
      await failure(
        lost.put(key("x"), Buffer.from("x"), { contentType: "text/plain" }),
      ),
    ).toBeInstanceOf(StorageError);
    expect(await failure(lost.ping())).toBeInstanceOf(StorageError);
  });

  it("an unreachable server is a StorageError, and ping answers within its short timeout", async () => {
    const down = createStorage({
      ...config(),
      endpoint: "http://127.0.0.1:1",
      connectionTimeoutMs: 500,
    });
    const started = Date.now();
    expect(await failure(down.ping())).toBeInstanceOf(StorageError);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

describe("/api/health storage check", () => {
  it("reports ok for a reachable bucket", async () => {
    const { healthReport } = await import("@/server/health");
    const report = await healthReport();
    expect(report.checks.storage).toBe("ok");
    const { closeDb } = await import("@/server/db/client");
    await closeDb();
  });

  it("reports degraded — not down — when Garage is unreachable, and the database check stays ok", async () => {
    vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:1");
    vi.resetModules(); // a fresh storage singleton that reads the changed endpoint
    try {
      const { healthReport } = await import("@/server/health");
      const report = await healthReport();
      expect(report.checks.storage).toBe("degraded");
      expect(report.checks.database).toBe("ok");
      expect(report.status).toBe("degraded");
      const { closeDb } = await import("@/server/db/client");
      await closeDb();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
