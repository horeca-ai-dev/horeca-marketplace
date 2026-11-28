/**
 * Company pages (D5-A3): what went wrong → which field and which catalogue message.
 *
 * Pure functions, no React. The profile, location and bank-details forms call these with the result
 * of a company Server Action (src/server/actions/company.ts) and pass the returned key to next-intl.
 * Every key type below is checked against messages/sr-Latn-ME.json by the compiler.
 *
 * Why keys and not the server's text: the server's messages are English; users read Montenegrin.
 * Field messages reuse the register form's keys (auth.errors.*) where the rule is the same field rule.
 */
import type { ConflictReason } from "@/server/domain/errors";
import { fieldErrorKey } from "@/lib/auth/form-errors";

/** Every field of the three company forms (profile, delivery location, bank details). */
export type CompanyFormField =
  | "legalName"
  | "taxId"
  | "vatNumber"
  | "addressLine"
  | "city"
  | "postalCode"
  | "contactEmail"
  | "contactPhone"
  | "label"
  | "contactName"
  | "iban";

export type CompanyFieldErrorKey =
  | ReturnType<typeof fieldErrorKey>
  | "company.errors.vatNumber.invalid"
  | `company.errors.label.${"required" | "invalid"}`
  | "company.errors.contactName.invalid"
  | `company.errors.iban.${"required" | "invalid"}`;

export type CompanyFormErrorKey =
  | `company.errors.form.${"validation" | "ownerOnly" | "notFound" | "generic"}`
  | "errors.conflict.message"
  | `errors.conflict.reason.${Extract<ConflictReason, "TAX_ID_TAKEN" | "DEFAULT_LOCATION_ARCHIVE">}`;

function isEmpty(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

/**
 * The message for an invalid field. We never show Zod's own (English) text: an empty required field
 * gets "required", anything else the field's one format message.
 */
export function companyFieldErrorKey(
  name: CompanyFormField,
  value: unknown,
): CompanyFieldErrorKey {
  switch (name) {
    case "vatNumber":
      return "company.errors.vatNumber.invalid";
    case "contactName":
      return "company.errors.contactName.invalid";
    case "label":
      return `company.errors.label.${isEmpty(value) ? "required" : "invalid"}`;
    case "iban":
      return `company.errors.iban.${isEmpty(value) ? "required" : "invalid"}`;
    default:
      return fieldErrorKey(name, value);
  }
}

/** What a company action's result (`{ data } | { validationErrors } | { serverError }`) means for the form. */
export type CompanyActionFailure =
  /** The input was rejected (422): the form re-runs the shared schema to find and mark the fields. */
  | { kind: "fields"; formKey: "company.errors.form.validation" }
  /** No session (any more): the form sends the user to the login page. */
  | { kind: "unauthenticated" }
  /** Anything else: one message above the form (or in the dialog). */
  | { kind: "form"; formKey: CompanyFormErrorKey };

type ActionErrorLike = { code: string; reason?: ConflictReason };

export function mapCompanyActionError(
  result:
    { validationErrors?: unknown; serverError?: ActionErrorLike } | undefined,
): CompanyActionFailure {
  const generic = {
    kind: "form",
    formKey: "company.errors.form.generic",
  } as const;
  // undefined: the request itself failed (network) — nothing more is known.
  if (!result) return generic;
  if (result.validationErrors) {
    return { kind: "fields", formKey: "company.errors.form.validation" };
  }
  const error = result.serverError;
  if (!error) return generic;

  switch (error.code) {
    // The domain validates again with the same schema; the browser finds the same fields.
    case "VALIDATION":
      return { kind: "fields", formKey: "company.errors.form.validation" };
    case "UNAUTHENTICATED":
      return { kind: "unauthenticated" };
    // The pages offer owner-only edits to owners only; a 403 means the role changed meanwhile.
    case "FORBIDDEN":
      return { kind: "form", formKey: "company.errors.form.ownerOnly" };
    case "NOT_FOUND":
      return { kind: "form", formKey: "company.errors.form.notFound" };
    case "CONFLICT":
      switch (error.reason) {
        case "DEFAULT_LOCATION_ARCHIVE":
          return {
            kind: "form",
            formKey: "errors.conflict.reason.DEFAULT_LOCATION_ARCHIVE",
          };
        // The tax ID is read-only on these pages, so this is another organization's PIB race —
        // a form message, not a field one.
        case "TAX_ID_TAKEN":
          return {
            kind: "form",
            formKey: "errors.conflict.reason.TAX_ID_TAKEN",
          };
        // No reason: an archived location edited, or the default changed at the same time.
        default:
          return { kind: "form", formKey: "errors.conflict.message" };
      }
    default:
      return generic;
  }
}

/** `ME25505000012345678951` → `ME25 5050 0001 2345 6789 51`: easier to read and compare. */
export function groupIban(iban: string): string {
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}
