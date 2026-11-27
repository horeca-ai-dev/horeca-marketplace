/**
 * Contracts between a buyer and a supplier — decision 012 §3 (APPLIED.md §4 · D5-B0).
 *
 * An active agreement enables purchase mode `direct` for that pair (buyer and supplier settle outside the
 * platform). Lifecycle: `requested` → `active` | `rejected`; `active` → `ended`. The buyer asks, the supplier
 * always confirms. There is no `kind` column (it changed no behaviour). Not the same as the S5 request for quote.
 *
 * Owner org type · RLS (policies in migration 0006):
 *   supplier_agreements  buyer + supplier · read: own buyer_org_id or supplier_org_id; platform read.
 *     Buyer inserts `requested` only; the supplier decides; the owner of either side ends an active one.
 *     Legal transitions and immutable columns are enforced by a guard trigger (RLS cannot compare old / new).
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const agreementStatus = pgEnum("agreement_status", [
  "requested",
  "active",
  "rejected",
  "ended",
]);

export const supplierAgreements = pgTable(
  "supplier_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    buyerOrgId: text("buyer_org_id")
      .notNull()
      .references(() => organization.id),
    supplierOrgId: text("supplier_org_id")
      .notNull()
      .references(() => organization.id),
    status: agreementStatus("status").notNull().default("requested"),
    /** Informational only (e.g. 30 days); nothing computes with it. */
    paymentTermDays: integer("payment_term_days"),
    buyerNote: text("buyer_note"),
    supplierNote: text("supplier_note"),
    requestedByUserId: text("requested_by_user_id")
      .notNull()
      .references(() => user.id),
    /** Who accepted / rejected it (a supplier member). NULL while `requested`. */
    decidedByUserId: text("decided_by_user_id").references(() => user.id),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    // At most one open (requested or active) agreement per pair; rejected and ended rows stay as history.
    uniqueIndex("supplier_agreements_one_open_uq")
      .on(t.buyerOrgId, t.supplierOrgId)
      .where(sql`${t.status} IN ('requested', 'active')`),
    index("supplier_agreements_supplier_idx").on(t.supplierOrgId, t.status),
    index("supplier_agreements_buyer_idx").on(t.buyerOrgId, t.status),
    check(
      "supplier_agreements_buyer_not_supplier",
      sql`${t.buyerOrgId} <> ${t.supplierOrgId}`,
    ),
    check(
      "supplier_agreements_term",
      sql`${t.paymentTermDays} IS NULL OR ${t.paymentTermDays} BETWEEN 0 AND 365`,
    ),
    // The decision fields match the status: nobody decided a `requested` row; a decided row says who and when;
    // `ended_at` exists exactly for `ended`.
    check(
      "supplier_agreements_decision",
      sql`(${t.status} = 'requested') = (${t.decidedAt} IS NULL AND ${t.decidedByUserId} IS NULL)
          AND (${t.status} = 'ended') = (${t.endedAt} IS NOT NULL)`,
    ),
  ],
);
