/**
 * Every status the UI shows → its badge tone (DESIGN.md → Badges). The label is always the catalogue
 * key `status.<entity>.<value>` (messages/sr-Latn-ME.json), so the map only decides the tone.
 *
 * The value types come from the Drizzle enums (type-only imports: nothing from the server is bundled).
 * status-map.test.ts fails when an enum gains a value that has no entry here, when an entry has no
 * catalogue text, or when a value is listed here that the enum does not have.
 */
import type {
  orgStatus,
  orderPaymentStatus,
  orderStatus,
  productStatus,
  purchaseMode,
  subOrderStatus,
  supplierSubmission,
} from "@/server/db/schema";

type EnumValue<T extends { enumValues: readonly string[] }> =
  T["enumValues"][number];

/*
 * TODO(D5 second migration — supplier_agreements, payments, product_stock): these three tables do not
 * exist yet. Their values are typed here from decision 012 / APPLIED.md §4; when the migration lands,
 * replace each array with the pgEnum's `enumValues` (like the entities above) so the test checks them
 * against the schema too.
 */
/** supplier_agreements.status (012 §3). */
export const CONTRACT_STATUSES = [
  "requested",
  "active",
  "rejected",
  "ended",
] as const;
/** payments.status (012 §6, APPLIED.md §4), plus `refunded`: shown when payments.refunded_cents > 0. */
export const CARD_PAYMENT_STATUSES = [
  "created",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "refunded",
] as const;
/** Derived for display from product_stock (status ok | unknown, available_qty) — 012 §7. */
export const STOCK_STATUSES = ["in_stock", "out_of_stock", "unknown"] as const;

export const TONES = [
  "positive",
  "attention",
  "negative",
  "neutral",
  "progress",
] as const;
export type Tone = (typeof TONES)[number];

/** `hidden`: the status exists but is not shown (an order with nothing to pay to the platform). */
export type StatusEntry = { tone: Tone } | { hidden: true };

type Values = {
  subOrder: EnumValue<typeof subOrderStatus>;
  order: EnumValue<typeof orderStatus>;
  orderPayment: EnumValue<typeof orderPaymentStatus>;
  cardPayment: (typeof CARD_PAYMENT_STATUSES)[number];
  contract: (typeof CONTRACT_STATUSES)[number];
  purchaseMode: EnumValue<typeof purchaseMode>;
  submission: EnumValue<typeof supplierSubmission>;
  product: EnumValue<typeof productStatus>;
  supplier: EnumValue<typeof orgStatus>;
  stock: (typeof STOCK_STATUSES)[number];
};

export type StatusEntity = keyof Values;
export type StatusValue<E extends StatusEntity> = Values[E];

export const STATUS_MAP = {
  subOrder: {
    pending: { tone: "attention" },
    confirmed: { tone: "progress" },
    shipped: { tone: "progress" },
    delivered: { tone: "positive" },
    cancelled: { tone: "negative" },
  },
  order: {
    in_progress: { tone: "progress" },
    completed: { tone: "positive" },
    cancelled: { tone: "negative" },
  },
  orderPayment: {
    unpaid: { tone: "attention" },
    paid: { tone: "positive" },
    refund_due: { tone: "attention" },
    not_applicable: { hidden: true }, // direct-only orders: nothing is due to the platform
  },
  cardPayment: {
    created: { tone: "attention" },
    pending: { tone: "attention" },
    succeeded: { tone: "positive" },
    failed: { tone: "negative" },
    cancelled: { tone: "negative" },
    expired: { tone: "negative" },
    refunded: { tone: "neutral" }, // label takes {amount}
  },
  contract: {
    requested: { tone: "attention" },
    active: { tone: "positive" },
    rejected: { tone: "negative" },
    ended: { tone: "neutral" },
  },
  purchaseMode: {
    direct: { tone: "neutral" },
    platform: { tone: "neutral" },
  },
  submission: {
    pending: { tone: "neutral" },
    accepted: { tone: "positive" },
    rejected: { tone: "negative" },
    failed: { tone: "negative" },
  },
  product: {
    draft: { tone: "neutral" },
    active: { tone: "positive" },
    archived: { tone: "neutral" },
  },
  // Suppliers are created approved by the admin (012); pending / rejected exist in the enum only.
  supplier: {
    pending: { tone: "attention" },
    approved: { tone: "positive" },
    rejected: { tone: "negative" },
    suspended: { tone: "negative" },
  },
  stock: {
    in_stock: { tone: "positive" }, // label takes {qty} {unit}
    out_of_stock: { tone: "attention" },
    unknown: { tone: "neutral" },
  },
} as const satisfies {
  [E in StatusEntity]: Record<StatusValue<E>, StatusEntry>;
};
