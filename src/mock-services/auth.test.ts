import { describe, expect, it } from "vitest";
import { isAuthorized } from "./auth";

const KEY = "test-supplier-key";

describe("isAuthorized", () => {
  it("accepts the right key as a Bearer token", () => {
    expect(isAuthorized(`Bearer ${KEY}`, KEY)).toBe(true);
  });

  it.each([
    ["no header", undefined],
    ["an empty header", ""],
    ["a wrong key", "Bearer wrong-key"],
    ["a key that only starts the same", `Bearer ${KEY.slice(0, -1)}`],
    ["a longer key", `Bearer ${KEY}x`],
    ["the bare key without a scheme", KEY],
    ["another scheme", `Basic ${KEY}`],
    ["an empty token", "Bearer "],
  ])("rejects %s", (_name, header) => {
    expect(isAuthorized(header, KEY)).toBe(false);
  });
});
