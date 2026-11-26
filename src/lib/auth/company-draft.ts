/**
 * Company draft (D4-A3) — keeps the typed company data when registration stops half-way.
 *
 * The user is created BEFORE the company. If the company step then fails, the user finishes on
 * "Complete company setup", possibly after logging in again — on a new page, where the register
 * form's state is gone. So the register form saves the COMPANY fields here and /complete-setup
 * pre-fills its form from them.
 *
 * Rules:
 *   - only the seven company fields are ever written — never the name, e-mail or password
 *   - sessionStorage: this browser tab only, gone when the tab closes; nothing is sent to the server
 *   - what is read back is untrusted (anybody can edit sessionStorage): it must pass the shared
 *     companySchema, otherwise it is thrown away
 *   - deleted after a successful setup and on logout
 *
 * The storage is a parameter, so the helpers are unit-tested without a browser. Every access is
 * wrapped: sessionStorage can be missing or throw (private mode, blocked site data, full quota),
 * and the forms must work without it.
 */
import { companySchema } from "@/lib/schemas/registration";
import { COMPANY_FIELDS, type CompanyFieldName } from "./form-errors";

export const COMPANY_DRAFT_KEY = "horeca.company-draft";

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type CompanyDraft = Record<CompanyFieldName, string>;

/** The tab's sessionStorage, or null where there is none (server render, storage blocked). */
export function browserDraftStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Saves the company fields of `values`; anything else in `values` is left out. */
export function saveCompanyDraft(
  storage: DraftStorage | null,
  values: Partial<Record<string, unknown>>,
): void {
  if (!storage) return;
  const draft: Partial<CompanyDraft> = {};
  // Field by field from a fixed list — never a copy of the whole object.
  for (const name of COMPANY_FIELDS) {
    const value = values[name];
    if (typeof value === "string") draft[name] = value;
  }
  try {
    storage.setItem(COMPANY_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // No draft is not an error: the user types the data again.
  }
}

/** The saved draft if it is valid company data; otherwise null (and the bad draft is removed). */
export function loadCompanyDraft(
  storage: DraftStorage | null,
): CompanyDraft | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(COMPANY_DRAFT_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    stored = undefined;
  }
  // The strict schema also rejects unknown keys, so a draft with extra data is not used at all.
  const parsed = companySchema.safeParse(stored);
  if (!parsed.success) {
    clearCompanyDraft(storage);
    return null;
  }
  const company = parsed.data;
  return {
    legalName: company.legalName,
    taxId: company.taxId,
    addressLine: company.addressLine,
    city: company.city,
    postalCode: company.postalCode,
    contactEmail: company.contactEmail,
    contactPhone: company.contactPhone ?? "",
  };
}

export function clearCompanyDraft(storage: DraftStorage | null): void {
  try {
    storage?.removeItem(COMPANY_DRAFT_KEY);
  } catch {
    // Nothing to do: sessionStorage empties itself when the tab closes.
  }
}
