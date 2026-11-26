/**
 * Ledger, settings, audit log — decisions 9 and 11, with the decision-012 edits of APPLIED.md §4 (D4-B1).
 * (`invoice_counters` is gone: pro-forma numbers come from a plain sequence, D4-B2.)
 *
 * Owner org type · RLS (policies come with D4-B2; this migration only grants):
 *   ledger_entries  supplier  · supplier OWNER reads own (app.role = 'owner'); platform all; insert-only
 *   settings        platform  · read: any logged-in org (checkout needs the default commission); write: platform
 *   audit_log       platform  · insert: any actor for itself; read: platform only; insert-only
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { orgType } from "./identity";
import { subOrders } from "./orders";
import { cents, createdAt } from "./shared";

export const ledgerEntryType = pgEnum("ledger_entry_type", [
  "sale", // + sub-order gross        (checkout, platform mode only)
  "commission", // − sub-order commission   (checkout, both modes)
  "sale_reversal", // − sub-order gross        (cancellation, platform mode only)
  "commission_reversal", // + sub-order commission   (cancellation, both modes)
  "payout", // − amount paid out to the supplier (platform admin; no real money)
  "adjustment", // ± correction with a description (platform admin)
  "commission_payment", // + amount a direct-mode supplier paid for its commission (platform admin records it)
]);

/**
 * What the platform owes each supplier. Sign: + = platform owes the supplier more.
 * Balance = SUM(amount_cents) per supplier (CLAUDE.md rule 9); it MAY be negative (a direct-mode supplier owes
 * its commission) — so there is deliberately no check against it. Append-only: no UPDATE/DELETE grants.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    supplierOrgId: text("supplier_org_id")
      .notNull()
      .references(() => organization.id),
    /** Required for sale/commission and their reversals; NULL for payout, adjustment and commission_payment. */
    subOrderId: uuid("sub_order_id").references(() => subOrders.id),
    type: ledgerEntryType("type").notNull(),
    amountCents: cents("amount_cents").notNull(),
    description: text("description").notNull(),
    /** Bank statement / payout reference for payouts and commission payments. */
    reference: text("reference"),
    /** NULL = system. */
    createdByUserId: text("created_by_user_id").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("ledger_entries_supplier_created_idx").on(
      t.supplierOrgId,
      t.createdAt,
    ),
    // Each kind of entry exists at most once per sub-order → double clicks / retries cannot double-book.
    uniqueIndex("ledger_entries_once_per_sub_order_uq")
      .on(t.subOrderId, t.type)
      .where(
        sql`${t.type} IN ('sale', 'commission', 'sale_reversal', 'commission_reversal')`,
      ),
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
            WHEN 'commission_payment' THEN ${t.amountCents} > 0
            ELSE ${t.amountCents} <> 0 END`,
    ),
  ],
);

/**
 * Platform settings (decision 11.9). Keys used in the MVP (seeded by src/server/db/seed/settings.ts):
 *   default_commission_bps  integer, e.g. 800
 *   platform_company        { legal_name, tax_id, vat_number, address, iban, bank_name } — the invoice issuer
 *   invoice_due_days        one integer (8) — decision 012: no per-method object
 *   vat_rates_bps           [2100, 1500, 700, 0] — verify Montenegrin rates
 * Changes are platform-only and audited.
 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedByUserId: text("updated_by_user_id").references(() => user.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    /** The policy name, e.g. `supplier.create`, `settings.update`. */
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
