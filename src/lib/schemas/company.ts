/**
 * Company self-service input (D5-B4, issue #65): profile, buyer delivery locations, supplier bank details.
 *
 * Shared by the forms (D5-A3) and the domain services (CLAUDE.md rule 13); the domain validates again with the
 * same schemas. Unknown keys are rejected (`z.strictObject`), so a request can never name an organization, a
 * status or any column we did not list: the organization always comes from the actor (rule 3).
 *
 * The company data of an existing organization is edited with the same `companySchema` that registration uses
 * (`CompanyInput`); this file adds locations and the IBAN.
 */
import { z } from "zod";
import { companySchema } from "./registration";

/** Edit the active organization's profile: the registration fields, all of them (a full replace). */
export const updateOrgProfileSchema = companySchema;

// ───────────────────────── buyer locations ─────────────────────────

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const locationFields = {
  label: z.string().trim().min(1).max(100),
  addressLine: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(100),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Postal code must have 5 digits."),
  contactName: optionalText(100),
  contactPhone: optionalText(50),
  /** Make this the default delivery location (the previous default is switched off in the same transaction). */
  makeDefault: z.boolean().default(false),
};

export const createLocationSchema = z.strictObject(locationFields);
export const updateLocationSchema = z.strictObject({
  locationId: z.uuid(),
  ...locationFields,
});
export const archiveLocationSchema = z.strictObject({ locationId: z.uuid() });
export const listLocationsSchema = z.strictObject({
  includeArchived: z.boolean().default(false),
});

// ───────────────────────── IBAN ─────────────────────────

/** Spaces and dashes out, upper case: what people paste ("me25 5050 0001 …") becomes the stored form. */
export function normalizeIban(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** Remainder of the IBAN-as-a-number modulo 97 (ISO 7064), digit by digit so no BigInt is needed. */
function mod97(rearranged: string): number {
  let remainder = 0;
  for (const ch of rearranged) {
    // Letters count as two digits: A = 10 … Z = 35.
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder;
}

/**
 * A Montenegrin IBAN: `ME` + 2 check digits + 18 digits = 22 characters (verify against the registry before a
 * real launch), with a correct mod-97 check. Other countries are refused in the MVP: all suppliers are local.
 */
export function isValidIban(normalized: string): boolean {
  if (!/^ME\d{20}$/.test(normalized)) return false;
  return mod97(normalized.slice(4) + normalized.slice(0, 4)) === 1;
}

/** `ME25…9951`: for the audit log, which must not hold a whole bank account number. */
export function maskIban(iban: string): string {
  return iban.length <= 8 ? "…" : `${iban.slice(0, 4)}…${iban.slice(-4)}`;
}

export const INVALID_IBAN_MESSAGE =
  "IBAN is not valid: it must be a Montenegrin IBAN (ME + 20 digits) with correct check digits.";

export const ibanSchema = z
  .string()
  .transform(normalizeIban)
  .pipe(z.string().refine(isValidIban, INVALID_IBAN_MESSAGE));

export const updateBankDetailsSchema = z.strictObject({ iban: ibanSchema });

export type UpdateOrgProfileInput = z.input<typeof updateOrgProfileSchema>;
export type CreateLocationInput = z.input<typeof createLocationSchema>;
export type UpdateLocationInput = z.input<typeof updateLocationSchema>;
export type ArchiveLocationInput = z.input<typeof archiveLocationSchema>;
export type ListLocationsInput = z.input<typeof listLocationsSchema>;
export type UpdateBankDetailsInput = z.input<typeof updateBankDetailsSchema>;
