/**
 * Cart, orders, sub-orders, lines, history, pro-forma invoices, buyer payments — decision 11, with the
 * decision-012 edits of APPLIED.md §4 (D4-B1).
 *
 * Shape: one checkout = one `orders` row → one `sub_orders` row per supplier → `order_lines` (snapshots).
 * `buyer_org_id` / `supplier_org_id` are deliberately DENORMALISED onto sub_orders, order_lines and
 * sub_order_events, so every RLS policy is a single-column comparison (decision 9.5) and a supplier never
 * needs to read the buyer's `orders` row (it would reveal the other suppliers' totals).
 *
 * Changed by decision 012 (each sub-order has its own purchase mode, no order-wide payment method):
 *   - `sub_orders.mode` = `direct` | `platform`; `direct` only under an active contract (the domain
 *     revalidates it inside the checkout transaction; the D5 policy repeats it)
 *   - `sub_orders.supplier_submission` is written by the worker only (column grant in the migration)
 *   - `orders.payment_method` and its enum are gone; `order_payment_status` gains `not_applicable`
 *   - the pro-forma covers the platform part only and is created once (no re-issue)
 *   - `order_payments` rows are inserted by the worker from gateway events, not typed in by an admin
 *
 * Owner org type · RLS (policies come with D4-B2; this migration only grants):
 *   carts, cart_items     buyer               · own rows only
 *   orders                buyer               · buyer own; platform all; worker read
 *   sub_orders            buyer + supplier    · buyer of the order or supplier of the sub-order; platform all
 *   order_lines           buyer + supplier    · same as sub_orders
 *   sub_order_events      buyer + supplier    · same as sub_orders; insert-only
 *   proforma_invoices     buyer               · buyer own; platform; worker (PDF). Suppliers: no access
 *   order_payments        buyer (read)        · buyer read own; worker insert; insert-only
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { products } from "./catalogue";
import { cents, createdAt, updatedAt } from "./shared";

const orgRef = (name: string) =>
  text(name)
    .notNull()
    .references(() => organization.id);

// ───────────────────────── cart ─────────────────────────

/** One cart per buyer organization, shared by all its members (decision 11.1). */
export const carts = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  buyerOrgId: orgRef("buyer_org_id").unique(),
  updatedAt: updatedAt(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    buyerOrgId: orgRef("buyer_org_id"),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    /** Net unit price the buyer saw when adding / last confirming. Checkout compares it → "price changed". */
    unitPriceCentsSeen: cents("unit_price_cents_seen").notNull(),
    addedByUserId: text("added_by_user_id")
      .notNull()
      .references(() => user.id),
    addedAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("cart_items_cart_product_uq").on(t.cartId, t.productId),
    check("cart_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

// ───────────────────────── orders ─────────────────────────

export const orderSource = pgEnum("order_source", ["cart", "rfq"]);
export const orderStatus = pgEnum("order_status", [
  "in_progress",
  "completed",
  "cancelled",
]);
/**
 * Derived from the platform part only (money-rules: amount due = non-cancelled `platform` sub-orders).
 * `not_applicable` = nothing is due to the platform (a direct-only order, or every platform part cancelled).
 */
export const orderPaymentStatus = pgEnum("order_payment_status", [
  "unpaid",
  "paid",
  "refund_due",
  "not_applicable",
]);

/** Human-readable order numbers come from a plain sequence (gaps allowed). */
export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 1 });

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `ORD-2026-000123` (year + order_number_seq, zero-padded). */
    number: text("number").notNull().unique(),
    buyerOrgId: orgRef("buyer_org_id"),
    placedByUserId: text("placed_by_user_id")
      .notNull()
      .references(() => user.id),
    /** Client-generated UUID; a repeated request returns the existing order (decision 11.8). */
    idempotencyKey: text("idempotency_key").notNull(),
    /** Hash of the checkout input; same key + different input → validation error. */
    requestHash: text("request_hash").notNull(),
    source: orderSource("source").notNull().default("cart"),
    /** S5 seam: FK to rfq_quotes is added by the S5 migration. */
    rfqQuoteId: uuid("rfq_quote_id"),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    /** Legal name, PIB, VAT number, address of the buyer at checkout. */
    buyerSnapshot: jsonb("buyer_snapshot").notNull(),
    /** Delivery location copied at checkout (CLAUDE.md rule 8). */
    deliverySnapshot: jsonb("delivery_snapshot").notNull(),
    /** Totals at checkout = Σ sub-orders. Never changed afterwards; the amount due is derived (money-rules.md). */
    netCents: cents("net_cents").notNull(),
    vatCents: cents("vat_cents").notNull(),
    grossCents: cents("gross_cents").notNull(),
    /** Derived from sub-orders; written only by app.recompute_order() (D4-B2). */
    status: orderStatus("status").notNull().default("in_progress"),
    /** Derived from order_payments vs. the platform part; written only by app.recompute_order() (D4-B2). */
    paymentStatus: orderPaymentStatus("payment_status")
      .notNull()
      .default("unpaid"),
    placedAt: timestamp("placed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Scoped to the buyer org: another org re-using a key can never receive this order.
    uniqueIndex("orders_buyer_idempotency_uq").on(
      t.buyerOrgId,
      t.idempotencyKey,
    ),
    index("orders_buyer_placed_idx").on(t.buyerOrgId, t.placedAt.desc()),
    index("orders_status_placed_idx").on(t.status, t.placedAt.desc()),
    check(
      "orders_gross_sum",
      sql`${t.grossCents} = ${t.netCents} + ${t.vatCents}`,
    ),
    check(
      "orders_non_negative",
      sql`${t.netCents} >= 0 AND ${t.vatCents} >= 0`,
    ),
    check(
      "orders_rfq_source",
      sql`(${t.source} = 'rfq') = (${t.rfqQuoteId} IS NOT NULL)`,
    ),
  ],
);

export const subOrderStatus = pgEnum("sub_order_status", [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
]);
/** Decision 012 §2: `direct` = under an active contract, paid outside the platform; `platform` = card payment. */
export const purchaseMode = pgEnum("purchase_mode", ["direct", "platform"]);
/** Sending the sub-order to the supplier's API (decision 012 §7). Written by the worker only. */
export const supplierSubmission = pgEnum("supplier_submission", [
  "pending",
  "accepted",
  "rejected",
  "failed",
]);

export const subOrders = pgTable(
  "sub_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    /** `ORD-2026-000123-1`, `-2` … in supplier order within the checkout. */
    number: text("number").notNull().unique(),
    buyerOrgId: orgRef("buyer_org_id"),
    supplierOrgId: orgRef("supplier_org_id"),
    status: subOrderStatus("status").notNull().default("pending"),
    /** Chosen per supplier group in the cart. No default: the checkout must decide. */
    mode: purchaseMode("mode").notNull(),
    /** Direct: submitted after commit; platform: after `payment.succeeded`. */
    supplierSubmission: supplierSubmission("supplier_submission")
      .notNull()
      .default("pending"),
    /** Copies so the supplier never reads `orders` (decision 9.5). */
    buyerSnapshot: jsonb("buyer_snapshot").notNull(),
    deliverySnapshot: jsonb("delivery_snapshot").notNull(),
    netCents: cents("net_cents").notNull(),
    vatCents: cents("vat_cents").notNull(),
    grossCents: cents("gross_cents").notNull(),
    /** Snapshot of the resolved rate (supplier override → platform default), basis points. Charged in BOTH modes. */
    commissionBps: integer("commission_bps").notNull(),
    /** round_half_up(net × bps / 10000), once per sub-order. */
    commissionCents: cents("commission_cents").notNull(),
    /** Copy of orders.payment_status for the supplier (written by app.recompute_order()). */
    orderPaymentStatus: orderPaymentStatus("order_payment_status")
      .notNull()
      .default("unpaid"),
    buyerNote: text("buyer_note"),
    cancelReason: text("cancel_reason"),
    cancelledByUserId: text("cancelled_by_user_id").references(() => user.id),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sub_orders_order_supplier_uq").on(t.orderId, t.supplierOrgId),
    index("sub_orders_supplier_status_idx").on(
      t.supplierOrgId,
      t.status,
      t.createdAt.desc(),
    ),
    index("sub_orders_buyer_idx").on(t.buyerOrgId, t.createdAt.desc()),
    index("sub_orders_order_idx").on(t.orderId),
    check(
      "sub_orders_gross_sum",
      sql`${t.grossCents} = ${t.netCents} + ${t.vatCents}`,
    ),
    check(
      "sub_orders_commission",
      sql`${t.commissionBps} BETWEEN 0 AND 10000 AND ${t.commissionCents} BETWEEN 0 AND ${t.netCents}`,
    ),
    check(
      "sub_orders_cancel_reason",
      sql`${t.status} <> 'cancelled' OR ${t.cancelReason} IS NOT NULL`,
    ),
    check(
      "sub_orders_buyer_not_supplier",
      sql`${t.buyerOrgId} <> ${t.supplierOrgId}`,
    ),
  ],
);

export const priceSource = pgEnum("price_source", [
  "base",
  "tier",
  "buyer",
  "rfq",
]);

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subOrderId: uuid("sub_order_id")
      .notNull()
      .references(() => subOrders.id),
    buyerOrgId: orgRef("buyer_org_id"),
    supplierOrgId: orgRef("supplier_org_id"),
    /** NULL only for RFQ lines (no catalogue product). Never joined for display — snapshots below are. */
    productId: uuid("product_id").references(() => products.id),
    position: smallint("position").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    /** Applied net unit price (S1: may come from a tier or buyer price) and where it came from. */
    unitPriceCents: cents("unit_price_cents").notNull(),
    priceSource: priceSource("price_source").notNull().default("base"),
    quantity: integer("quantity").notNull(),
    vatRateBps: integer("vat_rate_bps").notNull(),
    lineNetCents: cents("line_net_cents").notNull(),
    lineVatCents: cents("line_vat_cents").notNull(),
    lineGrossCents: cents("line_gross_cents").notNull(),
  },
  (t) => [
    uniqueIndex("order_lines_sub_order_position_uq").on(
      t.subOrderId,
      t.position,
    ),
    check(
      "order_lines_quantity_positive",
      sql`${t.quantity} > 0 AND ${t.unitPriceCents} > 0`,
    ),
    check(
      "order_lines_net",
      sql`${t.lineNetCents} = ${t.unitPriceCents} * ${t.quantity}`,
    ),
    check(
      "order_lines_gross",
      sql`${t.lineGrossCents} = ${t.lineNetCents} + ${t.lineVatCents}`,
    ),
    check(
      "order_lines_product_unless_rfq",
      sql`${t.priceSource} = 'rfq' OR ${t.productId} IS NOT NULL`,
    ),
  ],
);

/** History of every sub-order transition (decision 11.6). Insert-only. */
export const subOrderEvents = pgTable(
  "sub_order_events",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    subOrderId: uuid("sub_order_id")
      .notNull()
      .references(() => subOrders.id),
    buyerOrgId: orgRef("buyer_org_id"),
    supplierOrgId: orgRef("supplier_org_id"),
    fromStatus: subOrderStatus("from_status"),
    toStatus: subOrderStatus("to_status").notNull(),
    /** NULL = system. */
    actorUserId: text("actor_user_id").references(() => user.id),
    actorOrgId: text("actor_org_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("sub_order_events_sub_order_idx").on(t.subOrderId, t.createdAt),
  ],
);

// ───────────────────────── pro-forma invoices ─────────────────────────

export const invoiceStatus = pgEnum("invoice_status", ["issued", "superseded"]);

/**
 * One pro-forma per ORDER that has a platform part (decision 012 §5), issued by the platform. Inserted once,
 * in the checkout transaction; its totals are the PLATFORM sub-orders' totals, not the order's. The PDF is
 * rendered once by a job and stored; it is never regenerated and there is no re-issue after a cancellation
 * (`version` stays 1 in the MVP; `superseded` is kept for a later re-issue). An order without a platform
 * part gets no row. Number: `PF-<year>-<6 digits>` from app.next_invoice_number() (a plain sequence, D4-B2).
 */
export const proformaInvoices = pgTable(
  "proforma_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    buyerOrgId: orgRef("buyer_org_id"),
    version: integer("version").notNull().default(1),
    number: text("number").notNull().unique(),
    /** Platform company data from settings.platform_company (issuer + bank account). */
    issuerSnapshot: jsonb("issuer_snapshot").notNull(),
    buyerSnapshot: jsonb("buyer_snapshot").notNull(),
    /** Per-supplier sections with lines (platform sub-orders only) — everything the PDF needs; it never reads live data. */
    contentSnapshot: jsonb("content_snapshot").notNull(),
    /** `[{ rate_bps, net_cents, vat_cents }]`. */
    vatBreakdown: jsonb("vat_breakdown").notNull(),
    netCents: cents("net_cents").notNull(),
    vatCents: cents("vat_cents").notNull(),
    grossCents: cents("gross_cents").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** issued_at + settings.invoice_due_days (verify business terms). */
    dueDate: date("due_date").notNull(),
    /** Payment reference printed on the invoice (format: verify — Montenegrin "poziv na broj"). */
    paymentReference: text("payment_reference").notNull(),
    status: invoiceStatus("status").notNull().default("issued"),
    /** Set by the PDF job; NULL until rendered. Media volume, downloaded through an authorised route handler. */
    storageKey: text("storage_key"),
    pdfGeneratedAt: timestamp("pdf_generated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("proforma_invoices_order_version_uq").on(t.orderId, t.version),
    uniqueIndex("proforma_invoices_one_issued_uq")
      .on(t.orderId)
      .where(sql`${t.status} = 'issued'`),
    check(
      "proforma_invoices_gross_sum",
      sql`${t.grossCents} = ${t.netCents} + ${t.vatCents}`,
    ),
  ],
);

// ───────────────────────── buyer payments (to the platform) ─────────────────────────

export const orderPaymentType = pgEnum("order_payment_type", [
  "receipt",
  "refund",
]);

/**
 * What the buyer paid to the platform (receipt) and what was paid back (refund). Decision 012 §4: inserted by
 * the WORKER from signed gateway events (payment.succeeded → receipt, refund.succeeded → refund), always with
 * `payment_id` set and `recorded_by_user_id` NULL; there is no manual "record buyer payment" screen. Insert-only.
 * orders.payment_status is derived from it (money-rules.md).
 */
export const orderPayments = pgTable(
  "order_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    buyerOrgId: orgRef("buyer_org_id"),
    type: orderPaymentType("type").notNull(),
    amountCents: cents("amount_cents").notNull(),
    bankReference: text("bank_reference"),
    /** FK to `payments` is added by the D5-B0 migration (the table does not exist yet). Unique: one row per gateway payment. */
    paymentId: uuid("payment_id").unique(),
    /** NULL for rows the worker inserts from gateway events. */
    recordedByUserId: text("recorded_by_user_id").references(() => user.id),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("order_payments_order_idx").on(t.orderId),
    check("order_payments_positive", sql`${t.amountCents} > 0`),
    check(
      "order_payments_recorded",
      sql`${t.recordedByUserId} IS NOT NULL OR ${t.paymentId} IS NOT NULL`,
    ),
  ],
);
