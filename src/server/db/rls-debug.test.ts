import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "@/server/logger";
import { warnIfEmptyRead } from "./rls-debug";

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return {
    log: createLogger({ level: "info", destination }),
    parsed: () => lines.map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

const actor = {
  userId: "u1",
  orgId: "o1",
  orgType: "buyer",
  role: "member",
} as const;

describe("warnIfEmptyRead", () => {
  it("logs the RLS context when a local read returns no rows", () => {
    const { log, parsed } = capture();
    warnIfEmptyRead(log, actor, "products.list", [], "local");
    expect(parsed()).toEqual([
      expect.objectContaining({
        level: "warn",
        read: "products.list",
        rlsContext: {
          userId: "u1",
          orgId: "o1",
          orgType: "buyer",
          role: "member",
        },
        msg: expect.stringContaining("empty read under RLS") as unknown,
      }),
    ]);
  });

  it("shows missing context values as null (a read without context)", () => {
    const { log, parsed } = capture();
    warnIfEmptyRead(log, null, "orders.list", [], "local");
    expect(parsed()[0]).toMatchObject({
      rlsContext: { userId: null, orgId: null, orgType: null, role: null },
    });
  });

  it("stays silent when rows came back", () => {
    const { log, parsed } = capture();
    warnIfEmptyRead(log, actor, "products.list", [{ id: 1 }], "local");
    expect(parsed()).toEqual([]);
  });

  it.each(["staging", "production"] as const)(
    "stays silent on %s even for an empty read",
    (appEnv) => {
      const { log, parsed } = capture();
      warnIfEmptyRead(log, actor, "products.list", [], appEnv);
      expect(parsed()).toEqual([]);
    },
  );

  it("returns the very same rows it was given", () => {
    const { log } = capture();
    const rows = [{ id: 1 }, { id: 2 }];
    expect(warnIfEmptyRead(log, actor, "x", rows, "local")).toBe(rows);
    const empty: number[] = [];
    expect(warnIfEmptyRead(log, actor, "x", empty, "local")).toBe(empty);
  });
});
