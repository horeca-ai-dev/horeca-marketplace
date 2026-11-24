/**
 * Identity extension — our tables next to Better Auth (decision 3, adjusted in decisions 9 and 11).
 *
 * Better Auth owns users, sessions, organizations and memberships. Everything the marketplace needs to
 * know about a company lives here, 1:1 with `organization`.
 *
 * Owner org type · RLS (see rls.sql):
 *   org_profiles       every org has one   · own row; approved suppliers readable by all logged-in orgs; platform all
 *   supplier_profiles  supplier only       · own row (IBAN: owner role only, enforced in the domain); platform all
 *   buyer_locations    buyer only          · own rows; platform read
 */
import { sql } from "drizzle-orm";
import {
  boolean, char, check, foreignKey, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./better-auth.placeholder";

export const orgType = pgEnum("org_type", ["buyer", "supplier", "platform"]);
export const orgStatus = pgEnum("org_status", ["pending", "approved", "rejected", "suspended"]);

export const orgProfiles = pgTable(
  "org_profiles",
  {
    organizationId: text("organization_id").primaryKey().references(() => organization.id),
    /** Immutable after insert (guard trigger in rls.sql). */
    type: orgType("type").notNull(),
    /** Buyers and the platform are always `approved`; suppliers start `pending`. */
    status: orgStatus("status").notNull(),
    legalName: text("legal_name").notNull(),
    /** PIB. Immutable for non-platform actors (guard trigger). Format: verify (Montenegrin PIB). */
    taxId: text("tax_id").notNull(),
    /** PDV registration number; NULL = not in the VAT system. Format: verify. */
    vatNumber: text("vat_number"),
    addressLine: text("address_line").notNull(),
    city: text("city").notNull(),
    postalCode: text("postal_code").notNull(),
    country: char("country", { length: 2 }).notNull().default("ME"),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone"),
    rejectionReason: text("rejection_reason"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    statusChangedBy: text("status_changed_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Decision 3: tax ID unique per (tax_id, type) — one company may have a buyer and a supplier org.
    uniqueIndex("org_profiles_tax_id_type_uq").on(t.taxId, t.type),
    index("org_profiles_type_status_idx").on(t.type, t.status),
    check("org_profiles_status_by_type", sql`${t.type} = 'supplier' OR ${t.status} = 'approved'`),
    check("org_profiles_rejection_reason", sql`${t.status} <> 'rejected' OR ${t.rejectionReason} IS NOT NULL`),
  ],
);

export const supplierProfiles = pgTable(
  "supplier_profiles",
  {
    organizationId: text("organization_id").primaryKey(),
    /** Bank account for payouts. Required before approval (checked in `supplier.approve`). */
    iban: text("iban"),
    /** Basis points (100 = 1 %). NULL = platform default from `settings`. Platform-only (guard trigger). */
    commissionOverrideBps: integer("commission_override_bps"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "supplier_profiles_org_fk", columns: [t.organizationId], foreignColumns: [orgProfiles.organizationId] }),
    check(
      "supplier_profiles_commission_range",
      sql`${t.commissionOverrideBps} IS NULL OR ${t.commissionOverrideBps} BETWEEN 0 AND 10000`,
    ),
  ],
);

export const buyerLocations = pgTable(
  "buyer_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    label: text("label").notNull(),
    addressLine: text("address_line").notNull(),
    city: text("city").notNull(),
    postalCode: text("postal_code").notNull(),
    country: char("country", { length: 2 }).notNull().default("ME"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    isDefault: boolean("is_default").notNull().default(false),
    /** Locations are archived, never deleted (orders keep a snapshot anyway). */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "buyer_locations_org_fk", columns: [t.organizationId], foreignColumns: [orgProfiles.organizationId] }),
    index("buyer_locations_org_idx").on(t.organizationId),
    uniqueIndex("buyer_locations_one_default_uq")
      .on(t.organizationId)
      .where(sql`${t.isDefault} AND ${t.archivedAt} IS NULL`),
  ],
);
