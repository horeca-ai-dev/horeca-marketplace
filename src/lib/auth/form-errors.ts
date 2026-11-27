/**
 * Auth forms: what went wrong → which field and which catalogue message (D4-A3).
 *
 * Pure functions, no React. The forms (login, register, "Complete company setup") call these and
 * pass the returned key to next-intl. Every key type below is checked against
 * messages/sr-Latn-ME.json by the compiler (src/i18n/types.d.ts).
 *
 * Why keys and not the server's text: the server's messages are English; users read Montenegrin.
 */
import type { z } from "zod";
import type { ConflictReason } from "@/server/domain/errors";

export const ACCOUNT_FIELDS = ["name", "email", "password"] as const;
export const COMPANY_FIELDS = [
  "legalName",
  "taxId",
  "addressLine",
  "city",
  "postalCode",
  "contactEmail",
  "contactPhone",
] as const;

export type AccountFieldName = (typeof ACCOUNT_FIELDS)[number];
export type CompanyFieldName = (typeof COMPANY_FIELDS)[number];
export type FieldName = AccountFieldName | CompanyFieldName;

/** Fields that may stay empty: they have no "required" message. */
type OptionalField = "contactPhone";
/** Fields the server can report as already used by somebody else (409). */
export type TakenField = "email" | "taxId";

export type FieldErrorKey =
  | `auth.errors.${Exclude<FieldName, OptionalField>}.${"required" | "invalid"}`
  | `auth.errors.${OptionalField}.invalid`
  | `auth.errors.${TakenField}.taken`;

export type FormErrorKey =
  `auth.errors.form.${"invalidCredentials" | "rateLimited" | "registrationClosed" | "validation" | "generic"}`;

/** React Hook Form error `type` the forms set for a 409 on a field. */
export const TAKEN = "taken";

/** DOM id of a field: "company.taxId" → "company-taxId" (the error summary links to it). */
export function fieldId(path: string): string {
  return path.replaceAll(".", "-");
}

/**
 * The message for an invalid field. We do not show Zod's own (English) text: an empty required
 * field gets "required", anything else the field's one format message.
 */
export function fieldErrorKey(
  name: FieldName,
  value: unknown,
  type?: string,
): FieldErrorKey {
  if (type === TAKEN && (name === "email" || name === "taxId")) {
    return `auth.errors.${name}.taken`;
  }
  if (name === "contactPhone") return "auth.errors.contactPhone.invalid";
  const empty = typeof value !== "string" || value.trim() === "";
  return `auth.errors.${name}.${empty ? "required" : "invalid"}`;
}

/**
 * Server Action errors (the `serverError` of src/server/actions/safe-action.ts).
 *
 * A 409 is told apart by its `reason` (ConflictReason), never by its English message. A conflict
 * without a reason we know gets the generic Montenegrin message.
 */
export type ActionFailure =
  | { reason: "TAX_ID_TAKEN"; field: "taxId" }
  | { reason: "EMAIL_TAKEN"; field: "email" }
  /** The user already has a company: the form sends them to their area (via /login). */
  | { reason: "ALREADY_HAS_COMPANY" }
  /** No session (any more): the form sends the user to the login page. */
  | { reason: "UNAUTHENTICATED" }
  | {
      reason: "REGISTRATION_CLOSED" | "VALIDATION" | "UNKNOWN";
      formKey: FormErrorKey;
    };

export function mapActionError(
  error: { code: string; message: string; reason?: ConflictReason } | undefined,
): ActionFailure {
  const unknown: ActionFailure = {
    reason: "UNKNOWN",
    formKey: "auth.errors.form.generic",
  };
  if (!error) return unknown;

  switch (error.code) {
    case "CONFLICT":
      switch (error.reason) {
        case "TAX_ID_TAKEN":
          return { reason: "TAX_ID_TAKEN", field: "taxId" };
        case "EMAIL_TAKEN":
          return { reason: "EMAIL_TAKEN", field: "email" };
        case "ALREADY_HAS_COMPANY":
          return { reason: "ALREADY_HAS_COMPANY" };
        default:
          return unknown;
      }
    case "UNAUTHENTICATED":
      return { reason: "UNAUTHENTICATED" };
    // The registration actions answer 403 for one reason only: REGISTRATION_OPEN=false.
    case "FORBIDDEN":
      return {
        reason: "REGISTRATION_CLOSED",
        formKey: "auth.errors.form.registrationClosed",
      };
    case "VALIDATION":
      return { reason: "VALIDATION", formKey: "auth.errors.form.validation" };
    default:
      return unknown;
  }
}

/** Better Auth's client error for POST /sign-in/email → the login form's message. */
export function signInErrorKey(error: {
  status?: number;
  code?: string;
}): FormErrorKey {
  if (error.status === 429) return "auth.errors.form.rateLimited";
  if (error.status === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD") {
    return "auth.errors.form.invalidCredentials";
  }
  return "auth.errors.form.generic";
}

/**
 * The server rejected the input (422), but its answer names only the top-level key ("company"), not
 * the field. The browser has the same schema, so it runs it again to find the fields:
 * ["company.taxId", …]. Empty when the browser's copy finds nothing wrong.
 */
export function invalidPaths(schema: z.ZodType, values: unknown): string[] {
  const parsed = schema.safeParse(values);
  if (parsed.success) return [];
  return [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
}
