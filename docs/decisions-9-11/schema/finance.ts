/**
 * Ledger, settings, audit log, invoice counter — decisions 9 and 11.
 *
 * Owner org type · RLS (see rls.sql):
 *   ledger_entries    supplier  · supplier OWNER reads own (app.role = 'owner'); platform all; insert-only
 *   settings          platform  · read: any logged-in org (checkout needs the default commission); write: platform
 *   audit_log         platform  · insert: any actor for itself; read: platform only; insert-only
 *   invoice_counters  platform  · no direct access; only through app.next_invoice_number() (SECURITY DEFINER)
 */
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./better-auth.placeholder";
import { orgType } from "./identity-ext";
import { subOrders } from "./orders";
import { cents, createdAt } from "./_shared";

export const ledgerEntryType = pgEnum("ledger_entry_type", [
  "sale",                // + sub-order gross        (checkout)
  "commission",          // − sub-order commission   (checkout)
  "sale_reversal",       // − sub-order gross        (cancellation)
  "commission_reversal", // + sub-order commission   (cancellation)
  "payout",              // − amount paid out to the supplier (platform admin; no real money)
  "adjustment",          // ± correction with a description (platform admin)
]);

/**
 * What the platform owes each supplier. Sign: + = platform owes the supplier more.
 * Balance = SUM(amount_cents) per supplier (CLAUDE.md rule 9). Append-only: no UPDATE/DELETE grants.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    supplierOrgId: text("supplier_org_id").notNull().references(() => organization.id),
    /** Required for sale/commission and their reversals; NULL for payout/adjustment. */
    subOrderId: uuid("sub_order_id").references(() => subOrders.id),
    type: ledgerEntryType("type").notNull(),
    amountCents: cents("amount_cents").notNull(),
    description: text("description").notNull(),
    /** Bank statement / payout reference for payouts. */
    reference: text("reference"),
    /** NULL = system. */
    createdByUserId: text("created_by_user_id").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("ledger_entries_supplier_created_idx").on(t.supplierOrgId, t.createdAt),
    // Each kind of entry exists at most once per sub-order → double clicks / retries cannot double-book.
    uniqueIndex("ledger_entries_once_per_sub_order_uq")
      .on(t.subOrderId, t.type)
      .where(sql`${t.type} IN ('sale', 'commission', 'sale_reversal', 'commission_reversal')`),
    check(
      "ledger_entries_sub_order_link",
      sql`(${t.type} IN ('sale', 'commission', 'sale_reversal', 'commission_reversal')) = (${t.subOrderId} IS NOT NULL)`,
    ),
    check(
      "ledger_entries_sign",
      sql`CASE ${t.type}
            WHEN 'sale' THEN ${t.amountCents} > 0
            WHEN 'commission_reversal' THEN ${t.amountCents} >= 0
            WHEN 'commission' THEN ${t.amountCents} <= 0
            WHEN 'sale_reversal' THEN ${t.amountCents} < 0
            WHEN 'payout' THEN ${t.amountCents} < 0
            ELSE ${t.amountCents} <> 0 END`,
    ),
  ],
);

/**
 * Platform settings (decision 11.9). Keys used in the MVP:
 *   default_commission_bps  integer, e.g. 800
 *   platform_company        { legal_name, tax_id, vat_number, address, iban, bank_name } — the invoice issuer
 *   invoice_due_days        { proforma: 3, bank_transfer: 15 } — verify business terms
 *   vat_rates_bps           [2100, 700, 0] — verify Montenegrin rates
 * Changes are platform-only and audited.
 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedByUserId: text("updated_by_user_id").references(() => user.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Audit log (decision 9.6). Written in the same transaction as the audited change. Insert-only. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL = system (worker). */
    actorUserId: text("actor_user_id").references(() => user.id),
    actorOrgId: text("actor_org_id"),
    actorOrgType: orgType("actor_org_type"),
    /** The policy name, e.g. `supplier.approve`, `settings.update`. */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    requestId: text("request_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_created_idx").on(t.createdAt.desc()),
    index("audit_log_actor_org_idx").on(t.actorOrgId, t.createdAt.desc()),
  ],
);

/** Gapless pro-forma numbering per year — locked row, only via app.next_invoice_number() (rls.sql). */
export const invoiceCounters = pgTable(
  "invoice_counters",
  {
    year: integer("year").primaryKey(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (t) => [check("invoice_counters_non_negative", sql`${t.lastValue} >= 0`)],
);
