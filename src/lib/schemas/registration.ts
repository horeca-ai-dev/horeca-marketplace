/**
 * Registration input — the contract between the register form (D4-A3) and `org.register` (D2-B2).
 *
 * Registration is for BUYERS only (decision 012). Supplier organizations are created by the platform
 * admin (D5-B1), so there is no `type` field: whoever registers gets a buyer company.
 *
 * Shared by UI and server (CLAUDE.md rule 13). The server validates again with the same schema;
 * the form may use it for instant feedback. Unknown keys are rejected (`z.strictObject`).
 */
import { z } from "zod";

/** PIB: 8 digits (legal entities) or 13 digits (JMBG of a sole trader) — APPLIED.md, mentor question M5. */
export const taxIdSchema = z
  .string()
  .trim()
  .regex(/^(\d{8}|\d{13})$/, "Tax ID (PIB) must have 8 or 13 digits.");

const optionalText = z
  .string()
  .trim()
  .max(50)
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** The buyer company — also used alone by "Complete company setup" (user exists, organization not). */
export const companySchema = z.strictObject({
  legalName: z.string().trim().min(2).max(200),
  taxId: taxIdSchema,
  vatNumber: optionalText,
  addressLine: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(100),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Postal code must have 5 digits."),
  contactEmail: z.email().max(254),
  contactPhone: optionalText,
});

/** The person part — becomes the Better Auth user and the organization's owner. */
export const accountSchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  // Better Auth's defaults: 8–128 characters.
  password: z.string().min(8).max(128),
});

/** One form: account + buyer company (D4-A3). */
export const registrationSchema = z.strictObject({
  account: accountSchema,
  company: companySchema,
});

export type CompanyInput = z.infer<typeof companySchema>;
export type RegistrationInput = z.infer<typeof registrationSchema>;
