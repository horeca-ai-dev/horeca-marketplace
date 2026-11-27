/**
 * Turns a failed Zod parse into the domain's `Validation` error (CLAUDE.md rules 13 and 16).
 *
 * The domain validates its input itself, not only the Server Action in front of it: the CSV import job and
 * the seed call domain functions without any action. Field errors are keyed by the dotted path of the field
 * (`basePriceCents`, `attributes.capacity_l`), which is what a form needs to mark the right input.
 */
import type { z } from "zod";
import { Validation, type FieldErrors } from "./errors";

export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  const add = (path: string, message: string) => {
    (out[path] ??= []).push(message);
  };
  for (const issue of error.issues) {
    const path = issue.path.map(String);
    if (issue.code === "unrecognized_keys") {
      // One entry per unknown key, so the form can show it next to the field (or the log can count it).
      for (const key of issue.keys)
        add([...path, key].join("."), "Unknown field.");
    } else {
      add(path.join("."), issue.message);
    }
  }
  return out;
}

/** Parses `value` with `schema`, or throws `Validation` with field errors. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  value: unknown,
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Validation(undefined, fieldErrorsFromZod(result.error));
  }
  return result.data;
}
