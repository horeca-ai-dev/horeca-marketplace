import { describe, expect, it } from "vitest";
import { attributeValuesSchema, type AttributeDefinition } from "./attributes";

const def = (over: Partial<AttributeDefinition>): AttributeDefinition => ({
  key: "capacity_l",
  label: "Zapremina",
  type: "number",
  unit: "l",
  required: false,
  options: null,
  minValue: null,
  maxValue: null,
  isActive: true,
  ...over,
});

const DEFINITIONS: AttributeDefinition[] = [
  def({ key: "capacity_l", required: true, minValue: "20", maxValue: "1500" }),
  def({
    key: "material",
    type: "enum",
    unit: null,
    options: [
      { value: "stainless_steel", label: "Nerđajući čelik" },
      { value: "plastic", label: "Plastika" },
    ],
  }),
  def({ key: "has_lock", type: "boolean", unit: null }),
  def({ key: "note", type: "text", unit: null }),
  def({ key: "old_attr", type: "number", isActive: false }),
];

const parse = (value: unknown, complete: boolean) =>
  attributeValuesSchema(DEFINITIONS, { complete }).safeParse(value);

describe("attributeValuesSchema (generated from the definitions)", () => {
  it("accepts a valid set of values", () => {
    const r = parse(
      { capacity_l: 150, material: "plastic", has_lock: true, note: "ok" },
      true,
    );
    expect(r.success).toBe(true);
  });

  it("rejects a key the category does not have (no smuggling)", () => {
    const r = parse({ capacity_l: 150, colour: "red" }, true);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("colour");
  });

  it("rejects a value of a deactivated definition", () => {
    expect(parse({ capacity_l: 150, old_attr: 3 }, true).success).toBe(false);
  });

  it.each([
    ["below the minimum", 19.9],
    ["above the maximum", 1501],
    ["not a number", "150"],
    ["not finite", Infinity],
  ])("number: rejects %s", (_label, value) => {
    expect(parse({ capacity_l: value }, true).success).toBe(false);
  });

  it("number: the limits themselves are allowed", () => {
    expect(parse({ capacity_l: 20 }, true).success).toBe(true);
    expect(parse({ capacity_l: 1500 }, true).success).toBe(true);
  });

  it("number: names the range and the unit in the message", () => {
    const r = parse({ capacity_l: 5 }, true);
    expect(r.error?.issues[0]?.message).toBe("Must be at least 20 l.");
  });

  it("enum: only the offered values", () => {
    expect(parse({ capacity_l: 50, material: "wood" }, true).success).toBe(
      false,
    );
  });

  it("boolean: only true / false", () => {
    expect(parse({ capacity_l: 50, has_lock: "yes" }, true).success).toBe(
      false,
    );
  });

  it("text: not empty, at most 200 characters", () => {
    expect(parse({ capacity_l: 50, note: "   " }, true).success).toBe(false);
    expect(parse({ capacity_l: 50, note: "x".repeat(201) }, true).success).toBe(
      false,
    );
  });

  it("required attributes are enforced only when the set must be complete", () => {
    expect(parse({}, false).success).toBe(true); // a draft may be empty
    const r = parse({}, true); // an active product may not
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["capacity_l"]);
  });

  it("a wrong value is rejected even in a draft", () => {
    expect(parse({ capacity_l: 5 }, false).success).toBe(false);
  });

  it("a category without attributes accepts only an empty object", () => {
    const schema = attributeValuesSchema([], { complete: true });
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ anything: 1 }).success).toBe(false);
  });
});
