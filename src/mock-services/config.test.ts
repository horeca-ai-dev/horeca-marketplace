import { describe, expect, it } from "vitest";
import { behaviourOf, parseBehaviourConfig } from "./config";

describe("parseBehaviourConfig", () => {
  it("accepts the three behaviours", () => {
    const config = parseBehaviourConfig(
      '{"a":{"mode":"normal"},"b":{"mode":"down"},"c":{"mode":"out_of_stock","skus":["X-1"]}}',
    );
    expect(behaviourOf(config, "b")).toEqual({ mode: "down" });
    expect(behaviourOf(config, "c")).toEqual({
      mode: "out_of_stock",
      skus: ["X-1"],
    });
  });

  it("treats a supplier that is not listed as normal", () => {
    expect(behaviourOf(parseBehaviourConfig("{}"), "anyone")).toEqual({
      mode: "normal",
    });
    // Not fooled by members of Object.prototype.
    expect(behaviourOf({}, "constructor")).toEqual({ mode: "normal" });
  });

  it.each([
    ["not JSON", "{oops", /not valid JSON/],
    ["an unknown mode", '{"a":{"mode":"slow"}}', /invalid/],
    ["out_of_stock without SKUs", '{"a":{"mode":"out_of_stock"}}', /invalid/],
    ["an unknown key", '{"a":{"mode":"down","skus":["X"]}}', /invalid/],
    ["an array", "[]", /invalid/],
  ])("refuses %s", (_name, json, message) => {
    expect(() => parseBehaviourConfig(json)).toThrow(message);
  });
});
