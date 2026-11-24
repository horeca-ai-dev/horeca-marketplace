/**
 * Stretch tables — DESIGN ONLY, not in the MVP migration (handoff §5). Each is added by its own migration
 * after gate G3, without breaking MVP tables: the seams already exist (order_lines.price_source,
 * orders.source + orders.rfq_quote_id, orders.payment_method, order_payments.payment_id).
 *
 * Owner org type · RLS (see rls.sql, "stretch" section):
 *   price_tiers      supplier · supplier own write; read like products (S1: tiers are public to logged-in orgs)
 *   buyer_prices     supplier · supplier own; the named buyer reads its own rows; platform read
 *   rfq_requests     buyer    · buyer own; invited suppliers read; platform read
 *   rfq_invitations  buyer    · buyer own write; invited supplier reads its row; platform read
 *   rfq_quotes       supplier · supplier own write; buyer of the RFQ reads; platform read
 *   payments         buyer    · buyer own read; worker/system writes; platform read
 *   payment_events   platform · worker/system only; platform read; insert-only
 */
import { sql } from "drizzle-orm";
import {
  bigint, boolean, char, check, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp,
  uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./better-auth.placeholder";
import { buyerLocations } from "./identity-ext";
import { categories, products } from "./catalogue";
import { orders } from "./orders";
import { cents, createdAt, updatedAt } from "./_shared";

const orgRef = (name: string) => text(name).notNull().references(() => organization.id);

// ───────────── S1 volume tiers + buyer-specific prices (PricingResolver: buyer > tier > base) ─────────────

export const priceTiers = pgTable(
  "price_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id),
    supplierOrgId: orgRef("supplier_org_id"),
    /** Tier applies from this quantity upwards. */
    minQuantity: integer("min_quantity").notNull(),
    unitPriceCents: cents("unit_price_cents").notNull(),
  },
  (t) => [
    uniqueIndex("price_tiers_product_min_uq").on(t.productId, t.minQuantity),
    check("price_tiers_values", sql`${t.minQuantity} > 1 AND ${t.unitPriceCents} > 0`),
  ],
);

export const buyerPrices = pgTable(
  "buyer_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id),
    supplierOrgId: orgRef("supplier_org_id"),
    buyerOrgId: orgRef("buyer_org_id"),
    unitPriceCents: cents("unit_price_cents").notNull(),
    validFrom: date("valid_from").notNull(),
    /** NULL = open-ended. */
    validTo: date("valid_to"),
    createdAt: createdAt(),
  },
  (t) => [
    index("buyer_prices_lookup_idx").on(t.productId, t.buyerOrgId),
    check("buyer_prices_values", sql`${t.unitPriceCents} > 0 AND (${t.validTo} IS NULL OR ${t.validTo} >= ${t.validFrom})`),
    // Not expressible in Drizzle — add in the S1 migration (needs the btree_gist extension):
    //   ALTER TABLE buyer_prices ADD CONSTRAINT buyer_prices_no_overlap EXCLUDE USING gist
    //     (product_id WITH =, buyer_org_id WITH =, daterange(valid_from, valid_to, '[]') WITH &&);
  ],
);

// ───────────── S5 request for quote ─────────────

export const rfqStatus = pgEnum("rfq_status", ["open", "quoted", "accepted", "closed", "expired"]);
export const rfqQuoteStatus = pgEnum("rfq_quote_status", ["submitted", "accepted", "rejected", "withdrawn", "expired"]);

export const rfqRequests = pgTable("rfq_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyerOrgId: orgRef("buyer_org_id"),
  createdByUserId: text("created_by_user_id").notNull().references(() => user.id),
  categoryId: uuid("category_id").references(() => categories.id),
  deliveryLocationId: uuid("delivery_location_id").notNull().references(() => buyerLocations.id),
  title: text("title").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull(),
  unit: text("unit").notNull(),
  deadline: date("deadline").notNull(),
  status: rfqStatus("status").notNull().default("open"),
  createdAt: createdAt(),
});

/** Only invited suppliers see an RFQ (permission matrix: "S5 see RFQ / submit quote — only if invited"). */
export const rfqInvitations = pgTable(
  "rfq_invitations",
  {
    rfqId: uuid("rfq_id").notNull().references(() => rfqRequests.id),
    supplierOrgId: orgRef("supplier_org_id"),
    buyerOrgId: orgRef("buyer_org_id"),
    invitedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.rfqId, t.supplierOrgId] })],
);

export const rfqQuotes = pgTable(
  "rfq_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfqId: uuid("rfq_id").notNull().references(() => rfqRequests.id),
    supplierOrgId: orgRef("supplier_org_id"),
    buyerOrgId: orgRef("buyer_org_id"),
    unitPriceCents: cents("unit_price_cents").notNull(),
    vatRateBps: integer("vat_rate_bps").notNull(),
    leadTimeDays: integer("lead_time_days").notNull(),
    validUntil: date("valid_until").notNull(),
    note: text("note"),
    status: rfqQuoteStatus("status").notNull().default("submitted"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("rfq_quotes_rfq_supplier_uq").on(t.rfqId, t.supplierOrgId),
    check("rfq_quotes_values", sql`${t.unitPriceCents} > 0 AND ${t.leadTimeDays} >= 0`),
  ],
);
// Accepting a quote calls createOrder(source = 'rfq', lines) → orders.rfq_quote_id; the S5 migration adds
//   ALTER TABLE orders ADD CONSTRAINT orders_rfq_quote_fk FOREIGN KEY (rfq_quote_id) REFERENCES rfq_quotes(id);

// ───────────── S6 mock card payment (PaymentProvider) ─────────────

export const paymentStatus = pgEnum("payment_status", ["created", "pending", "succeeded", "failed", "cancelled"]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  buyerOrgId: orgRef("buyer_org_id"),
  provider: text("provider").notNull().default("mock"),
  /** Provider's payment ID; NULL until redirected. */
  providerRef: text("provider_ref").unique(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: paymentStatus("status").notNull().default("created"),
  amountCents: cents("amount_cents").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Every callback, valid or not. provider_event_id UNIQUE = duplicate callbacks are no-ops. Insert-only. */
export const paymentEvents = pgTable("payment_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  providerEventId: text("provider_event_id").notNull().unique(),
  type: text("type").notNull(),
  /** HMAC verified in constant time (CLAUDE.md security rules). */
  signatureValid: boolean("signature_valid").notNull(),
  amountCents: cents("amount_cents"),
  raw: jsonb("raw").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
// On `succeeded` (valid signature, amount matches): insert order_payments(type = 'receipt', payment_id = …).
// S6 migration: ALTER TABLE order_payments ADD CONSTRAINT order_payments_payment_fk FOREIGN KEY (payment_id) REFERENCES payments(id);
