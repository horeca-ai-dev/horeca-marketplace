/**
 * What the company profile component receives from a page (D5-A3): the editable company fields as
 * plain strings, so a Server Component can pass them to the Client Component. No ids, no status, no
 * timestamps — the profile never sends the browser more than it shows.
 */
import type { OrgProfileRecord } from "@/server/domain/org-profile";

export type CompanyProfileView = {
  legalName: string;
  taxId: string;
  vatNumber: string | null;
  addressLine: string;
  city: string;
  postalCode: string;
  contactEmail: string;
  contactPhone: string | null;
};

export function toProfileView(record: OrgProfileRecord): CompanyProfileView {
  return {
    legalName: record.legalName,
    taxId: record.taxId,
    vatNumber: record.vatNumber,
    addressLine: record.addressLine,
    city: record.city,
    postalCode: record.postalCode,
    contactEmail: record.contactEmail,
    contactPhone: record.contactPhone,
  };
}
