/**
 * Product attributes — the Zod schema is GENERATED from the category's attribute definitions
 * (decision 10, CLAUDE.md rule 13), never written by hand per category.
 *
 * A category inherits its ancestors' attributes (no overrides), so the service loads the definitions of the
 * whole path and passes them here. Rules:
 *   - only ACTIVE definitions are accepted; any other key is rejected (`z.strictObject`) — a supplier cannot
 *     smuggle in a key the category does not have
 *   - number: a finite JSON number inside [min, max], stored in the canonical unit of the key (no conversion)
 *   - enum: one of the option values · boolean: true / false · text: 1–200 characters
 *   - a `required` attribute must be present only when `complete` is set (a draft may be incomplete; an
 *     active product may not, because buyers see it)
 *
 * Framework-free and database-free: unit-tested on its own.
 */
import { z } from "zod";

export type AttributeDefinition = {
  key: string;
  label: string;
  type: "number" | "enum" | "boolean" | "text";
  unit: string | null;
  required: boolean;
  options: { value: string; label: string }[] | null;
  /** `numeric` columns arrive as strings. */
  minValue: string | null;
  maxValue: string | null;
  isActive: boolean;
};

export type AttributeValues = Record<string, string | number | boolean>;

function numberSchema(def: AttributeDefinition): z.ZodType {
  const min = def.minValue === null ? undefined : Number(def.minValue);
  const max = def.maxValue === null ? undefined : Number(def.maxValue);
  const unit = def.unit ? ` ${def.unit}` : "";
  const range =
    min !== undefined && max !== undefined
      ? ` between ${min} and ${max}${unit}`
      : "";
  let schema = z.number({ error: `Must be a number${range}.` }).finite();
  if (min !== undefined)
    schema = schema.min(min, `Must be at least ${min}${unit}.`);
  if (max !== undefined)
    schema = schema.max(max, `Must be at most ${max}${unit}.`);
  return schema;
}

function valueSchema(def: AttributeDefinition): z.ZodType {
  switch (def.type) {
    case "number":
      return numberSchema(def);
    case "enum": {
      const values = (def.options ?? []).map((o) => o.value);
      return z.enum(values as [string, ...string[]], {
        error: "Choose one of the offered values.",
      });
    }
    case "boolean":
      return z.boolean({ error: "Must be yes or no." });
    case "text":
      return z.string().trim().min(1).max(200);
  }
}

/** The schema for one category's attribute values. */
export function attributeValuesSchema(
  definitions: readonly AttributeDefinition[],
  options: { complete: boolean },
) {
  const shape: Record<string, z.ZodType> = {};
  for (const def of definitions) {
    if (!def.isActive) continue;
    const schema = valueSchema(def);
    shape[def.key] =
      def.required && options.complete ? schema : schema.optional();
  }
  return z.strictObject(shape);
}
