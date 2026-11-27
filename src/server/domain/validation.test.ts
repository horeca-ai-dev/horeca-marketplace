import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Validation } from "./errors";
import { fieldErrorsFromZod, parseInput } from "./validation";

const schema = z.strictObject({
  name: z.string().min(2, "Too short."),
  nested: z.strictObject({ n: z.number() }),
});

describe("parseInput", () => {
  it("returns the parsed value", () => {
    expect(parseInput(schema, { name: "ab", nested: { n: 1 } })).toEqual({
      name: "ab",
      nested: { n: 1 },
    });
  });

  it("throws Validation (422) with the field errors keyed by the dotted path", () => {
    let error: unknown;
    try {
      parseInput(schema, { name: "a", nested: { n: "x" } });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Validation);
    const fields = (error as Validation).fieldErrors;
    expect(fields.name).toEqual(["Too short."]);
    expect(Object.keys(fields)).toContain("nested.n");
  });

  it("names every unknown key, at the top level and nested", () => {
    const result = schema.safeParse({
      name: "ab",
      nested: { n: 1, extra: true },
      status: "active",
    });
    expect(result.success).toBe(false);
    const fields = fieldErrorsFromZod(result.error!);
    expect(fields).toEqual({
      "nested.extra": ["Unknown field."],
      status: ["Unknown field."],
    });
  });
});
