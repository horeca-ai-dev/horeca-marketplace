/**
 * A delivery location as the buyer's company page sends it to the browser (D5-A3): only what the
 * table, the panel and the actions need — no organization id, no timestamps.
 */
import type { LocationRecord } from "@/server/domain/buyer-locations";

export type LocationRow = {
  id: string;
  label: string;
  addressLine: string;
  city: string;
  postalCode: string;
  contactName: string | null;
  contactPhone: string | null;
  isDefault: boolean;
  archived: boolean;
};

export function toLocationRow(record: LocationRecord): LocationRow {
  return {
    id: record.id,
    label: record.label,
    addressLine: record.addressLine,
    city: record.city,
    postalCode: record.postalCode,
    contactName: record.contactName,
    contactPhone: record.contactPhone,
    isDefault: record.isDefault,
    archived: record.archivedAt !== null,
  };
}

/** The fields an update must send again: `updateLocation` replaces every field of the location. */
export function locationFields(row: LocationRow) {
  return {
    label: row.label,
    addressLine: row.addressLine,
    city: row.city,
    postalCode: row.postalCode,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
  };
}
