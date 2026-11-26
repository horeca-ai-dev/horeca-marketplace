/**
 * Migration 0004 (order core) against a real, migrated Postgres (D4-B1): the CHECK constraints and unique
 * indexes reject bad rows, and the grants give each login exactly what rls.sql §3 + APPLIED.md say —
 * above all that money can never change after checkout and that the ledger is append-only.
 *
 * RLS policies are not enabled yet (D4-B2), so this proves constraints and grants only.
 * Fixtures are committed as horeca_owner (the migration login) and removed in afterAll.
 */
import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/env.core";
import { closeDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { seedCatalogue } from "@/server/db/seed/catalogue";
import { DEFAULT_SETTINGS, seedSettings } from "@/server/db/seed/settings";
import { withSystemTx, withTx, type RlsContext } from "@/server/db/tx";
import { failsWith, rejected } from "./helpers";

const ownerPool = new Pool({ connectionString: env.DATABASE_MIGRATE_URL });
const owner = drizzle(ownerPool, { schema });
const {
  orders,
  subOrders,
  orderLines,
  orderPayments,
  proformaInvoices,
  ledgerEntries,
  subOrderEvents,
  auditLog,
  cartItems,
  carts,
  settings,
} = schema;

const run = randomBytes(4).toString("hex");
const buyerA = `t_buyA_${run}`;
const buyerB = `t_buyB_${run}`;
const supplier1 = `t_sup1_${run}`;
const supplier2 = `t_sup2_${run}`;
const orgIds = [buyerA, buyerB, supplier1, supplier2];
const userId = `t_user_${run}`;
const actor: RlsContext = {
  userId,
  orgId: buyerA,
  orgType: "buyer",
  role: "owner",
};

let productId: string;
let n = 0;
const unique = (label: string) => `${label}-${run}-${(n += 1)}`;

// ── fixtures ────────────────────────────────────────────────────────────────

const money = (net = 1000, vatRate = 2100) => {
  const vat = Math.round((net * vatRate) / 10000);
  return { netCents: net, vatCents: vat, grossCents: net + vat };
};

const newOrder = (over: Partial<typeof orders.$inferInsert> = {}) => ({
  number: unique("ORD"),
  buyerOrgId: buyerA,
  placedByUserId: userId,
  idempotencyKey: unique("key"),
  requestHash: "hash",
  buyerSnapshot: {},
  deliverySnapshot: {},
  ...money(),
  ...over,
});

const newSubOrder = (
  orderId: string,
  over: Partial<typeof subOrders.$inferInsert> = {},
) => ({
  orderId,
  number: unique("SUB"),
  buyerOrgId: buyerA,
  supplierOrgId: supplier1,
  mode: "platform" as const,
  buyerSnapshot: {},
  deliverySnapshot: {},
  ...money(),
  commissionBps: 800,
  commissionCents: 80,
  ...over,
});

async function insertOrder(over: Partial<typeof orders.$inferInsert> = {}) {
  const [row] = await owner
    .insert(orders)
    .values(newOrder(over))
    .returning({ id: orders.id });
  return row!.id;
}

async function insertSubOrder(
  orderId: string,
  over: Partial<typeof subOrders.$inferInsert> = {},
) {
  const [row] = await owner
    .insert(subOrders)
    .values(newSubOrder(orderId, over))
    .returning({ id: subOrders.id });
  return row!.id;
}

const newLine = (
  subOrderId: string,
  over: Partial<typeof orderLines.$inferInsert> = {},
) => ({
  subOrderId,
  buyerOrgId: buyerA,
  supplierOrgId: supplier1,
  productId,
  position: 1,
  sku: "SKU-1",
  name: "Podpultni frižider",
  unit: "piece",
  unitPriceCents: 500,
  quantity: 2,
  vatRateBps: 2100,
  lineNetCents: 1000,
  lineVatCents: 210,
  lineGrossCents: 1210,
  ...over,
});

const entry = (
  supplierOrgId: string,
  type: (typeof ledgerEntries.$inferInsert)["type"],
  amountCents: number,
  subOrderId: string | null = null,
) => ({
  supplierOrgId,
  type,
  amountCents,
  subOrderId,
  description: "test",
});

beforeAll(async () => {
  const now = new Date();
  await owner.insert(schema.user).values({
    id: userId,
    name: "Test",
    email: `${userId}@example.test`,
  });
  await owner
    .insert(schema.organization)
    .values(orgIds.map((id) => ({ id, name: id, slug: id, createdAt: now })));
  await owner.transaction((tx) => seedCatalogue(tx));
  const [leaf] = await owner
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      sql`${schema.categories.path} = 'refrigeration.under_counter'::ltree`,
    );
  const [p] = await owner
    .insert(schema.products)
    .values({
      supplierOrgId: supplier1,
      categoryId: leaf!.id,
      sku: `P-${run}`,
      name: "Test proizvod",
      basePriceCents: 500,
      vatRateBps: 2100,
    })
    .returning({ id: schema.products.id });
  productId = p!.id;
});

afterAll(async () => {
  // The owner may delete what the web login never can (append-only tables) — children first.
  const orderIds = sql`(select id from orders where buyer_org_id in (${sql.join(
    orgIds.map((o) => sql`${o}`),
    sql`, `,
  )}))`;
  const subIds = sql`(select id from sub_orders where order_id in ${orderIds})`;
  await owner.execute(
    sql`delete from ledger_entries where supplier_org_id in (${supplier1}, ${supplier2})`,
  );
  await owner.execute(
    sql`delete from sub_order_events where sub_order_id in ${subIds}`,
  );
  await owner.execute(
    sql`delete from order_lines where sub_order_id in ${subIds}`,
  );
  await owner.execute(
    sql`delete from order_payments where order_id in ${orderIds}`,
  );
  await owner.execute(
    sql`delete from proforma_invoices where order_id in ${orderIds}`,
  );
  await owner.execute(
    sql`delete from sub_orders where order_id in ${orderIds}`,
  );
  await owner.execute(
    sql`delete from orders where buyer_org_id in (${buyerA}, ${buyerB})`,
  );
  await owner.execute(
    sql`delete from cart_items where buyer_org_id in (${buyerA}, ${buyerB})`,
  );
  await owner.execute(
    sql`delete from carts where buyer_org_id in (${buyerA}, ${buyerB})`,
  );
  await owner.execute(
    sql`delete from audit_log where actor_user_id = ${userId}`,
  );
  await owner.execute(
    sql`delete from products where supplier_org_id = ${supplier1}`,
  );
  await owner.execute(
    sql`delete from organization where id in (${buyerA}, ${buyerB}, ${supplier1}, ${supplier2})`,
  );
  await owner.execute(sql`delete from "user" where id = ${userId}`);
  await ownerPool.end();
  await closeDb();
});

// ── orders and sub-orders ───────────────────────────────────────────────────

describe("orders", () => {
  it("starts unpaid and in progress, with the 012 payment status available", async () => {
    const id = await insertOrder();
    const [row] = await owner
      .select({ s: orders.status, p: orders.paymentStatus })
      .from(orders)
      .where(eq(orders.id, id));
    expect(row).toEqual({ s: "in_progress", p: "unpaid" });
    await owner
      .update(orders)
      .set({ paymentStatus: "not_applicable" })
      .where(eq(orders.id, id));
  });

  it.each([
    ["orders_gross_sum", { grossCents: 999 }],
    ["orders_non_negative", { netCents: -1, vatCents: 0, grossCents: -1 }],
    ["orders_rfq_source", { source: "rfq" as const }], // an rfq order needs a quote id
  ])("rejects a row that breaks %s", async (constraint, over) => {
    await rejected(constraint, () =>
      owner.insert(orders).values(newOrder(over)),
    );
  });

  it("scopes the idempotency key to the buyer organization", async () => {
    const key = unique("same-key");
    await insertOrder({ idempotencyKey: key, buyerOrgId: buyerA });
    await insertOrder({ idempotencyKey: key, buyerOrgId: buyerB }); // another org may reuse it
    await rejected("orders_buyer_idempotency_uq", () =>
      owner
        .insert(orders)
        .values(newOrder({ idempotencyKey: key, buyerOrgId: buyerA })),
    );
  });

  it("has no payment_method column any more (decision 012)", async () => {
    const rows = await owner.execute(
      sql`select 1 from information_schema.columns where table_name = 'orders' and column_name = 'payment_method'`,
    );
    expect(rows.rows).toHaveLength(0);
  });
});

describe("sub-orders", () => {
  it("defaults supplier_submission to pending and accepts both purchase modes", async () => {
    const orderId = await insertOrder();
    const a = await insertSubOrder(orderId, { mode: "direct" });
    const b = await insertSubOrder(orderId, {
      supplierOrgId: supplier2,
      mode: "platform",
    });
    const rows = await owner
      .select({
        id: subOrders.id,
        mode: subOrders.mode,
        s: subOrders.supplierSubmission,
      })
      .from(subOrders)
      .where(inArray(subOrders.id, [a, b]));
    expect(rows.map((r) => [r.mode, r.s]).sort()).toEqual([
      ["direct", "pending"],
      ["platform", "pending"],
    ]);
  });

  it("requires a mode and refuses an unknown one", async () => {
    const orderId = await insertOrder();
    // Raw SQL: the typed insert would not even compile without a mode.
    await failsWith("23502", () =>
      owner.execute(sql`insert into sub_orders (order_id, number, buyer_org_id, supplier_org_id, buyer_snapshot, delivery_snapshot, net_cents, vat_cents, gross_cents, commission_bps, commission_cents)
        values (${orderId}, ${unique("SUB")}, ${buyerA}, ${supplier1}, '{}', '{}', 1000, 210, 1210, 800, 80)`),
    );
    await failsWith("22P02", () =>
      owner.execute(sql`select 'bank_transfer'::purchase_mode`),
    ); // invalid input value for enum
  });

  it.each([
    ["sub_orders_gross_sum", { grossCents: 1 }],
    ["sub_orders_commission", { commissionBps: 10001 }],
    ["sub_orders_commission", { commissionCents: 1001 }], // more than the net
    ["sub_orders_cancel_reason", { status: "cancelled" as const }],
    ["sub_orders_buyer_not_supplier", { supplierOrgId: buyerA }],
  ])("rejects a row that breaks %s", async (constraint, over) => {
    const orderId = await insertOrder();
    await rejected(constraint, () =>
      owner.insert(subOrders).values(newSubOrder(orderId, over)),
    );
  });

  it("allows one sub-order per supplier in an order", async () => {
    const orderId = await insertOrder();
    await insertSubOrder(orderId);
    await rejected("sub_orders_order_supplier_uq", () =>
      owner.insert(subOrders).values(newSubOrder(orderId)),
    );
  });
});

describe("order lines, payments and pro-forma", () => {
  it.each([
    [
      "order_lines_quantity_positive",
      { quantity: 0, lineNetCents: 0, lineGrossCents: 210 },
    ],
    ["order_lines_net", { lineNetCents: 999, lineGrossCents: 1209 }],
    ["order_lines_gross", { lineGrossCents: 1 }],
    ["order_lines_product_unless_rfq", { productId: null }],
  ])("rejects a line that breaks %s", async (constraint, over) => {
    const sub = await insertSubOrder(await insertOrder());
    await rejected(constraint, () =>
      owner.insert(orderLines).values(newLine(sub, over)),
    );
  });

  it("rejects the same position twice in a sub-order", async () => {
    const sub = await insertSubOrder(await insertOrder());
    await owner.insert(orderLines).values(newLine(sub));
    await rejected("order_lines_sub_order_position_uq", () =>
      owner.insert(orderLines).values(newLine(sub)),
    );
  });

  const payment = (
    orderId: string,
    over: Partial<typeof orderPayments.$inferInsert> = {},
  ) => ({
    orderId,
    buyerOrgId: buyerA,
    type: "receipt" as const,
    amountCents: 1210,
    paymentId: crypto.randomUUID(),
    ...over,
  });

  it("accepts a gateway payment (worker style) and rejects the impossible ones", async () => {
    const orderId = await insertOrder();
    await owner.insert(orderPayments).values(payment(orderId));
    await rejected("order_payments_positive", () =>
      owner.insert(orderPayments).values(payment(orderId, { amountCents: 0 })),
    );
    await rejected(
      "order_payments_recorded",
      () =>
        owner
          .insert(orderPayments)
          .values(payment(orderId, { paymentId: null })), // nobody recorded it
    );
  });

  const invoice = (
    orderId: string,
    over: Partial<typeof proformaInvoices.$inferInsert> = {},
  ) => ({
    orderId,
    buyerOrgId: buyerA,
    number: unique("PF"),
    issuerSnapshot: {},
    buyerSnapshot: {},
    contentSnapshot: {},
    vatBreakdown: [],
    ...money(),
    dueDate: "2026-12-31",
    paymentReference: "ref",
    ...over,
  });

  it("keeps one issued pro-forma per order and its totals consistent", async () => {
    const orderId = await insertOrder();
    await owner.insert(proformaInvoices).values(invoice(orderId));
    await rejected("proforma_invoices_one_issued_uq", () =>
      owner.insert(proformaInvoices).values(invoice(orderId, { version: 2 })),
    );
    const otherOrder = await insertOrder();
    await rejected("proforma_invoices_gross_sum", () =>
      owner
        .insert(proformaInvoices)
        .values(invoice(otherOrder, { grossCents: 1 })),
    );
    // A superseded version may sit next to an issued one (kept for a later re-issue).
    await owner
      .insert(proformaInvoices)
      .values(invoice(orderId, { version: 2, status: "superseded" }));
  });
});

// ── ledger ──────────────────────────────────────────────────────────────────

describe("ledger entries", () => {
  it.each([
    // [type, amount, allowed?]
    ["sale", 1210, true],
    ["sale", -1210, false],
    ["commission", -80, true],
    ["commission", 80, false],
    ["sale_reversal", -1210, true],
    ["sale_reversal", 1210, false],
    ["commission_reversal", 80, true],
    ["commission_reversal", -80, false],
    ["commission_payment", 80, true], // decision 012: a direct-mode supplier pays its commission
    ["commission_payment", -80, false],
    ["commission_payment", 0, false],
  ] as const)("%s %d → allowed: %s", async (type, amount, allowed) => {
    const sub = await insertSubOrder(await insertOrder());
    const linked = type !== "commission_payment";
    const row = entry(supplier1, type, amount, linked ? sub : null);
    if (allowed) await owner.insert(ledgerEntries).values(row);
    else
      await rejected("ledger_entries_sign", () =>
        owner.insert(ledgerEntries).values(row),
      );
  });

  it("allows a payout (negative) and an adjustment of either sign, but not zero", async () => {
    await owner.insert(ledgerEntries).values(entry(supplier2, "payout", -500));
    await owner
      .insert(ledgerEntries)
      .values(entry(supplier2, "adjustment", 100));
    await owner
      .insert(ledgerEntries)
      .values(entry(supplier2, "adjustment", -100));
    await rejected("ledger_entries_sign", () =>
      owner.insert(ledgerEntries).values(entry(supplier2, "adjustment", 0)),
    );
    await rejected("ledger_entries_sign", () =>
      owner.insert(ledgerEntries).values(entry(supplier2, "payout", 500)),
    );
  });

  it("ties sale and commission to a sub-order, and payout / commission_payment to none", async () => {
    const sub = await insertSubOrder(await insertOrder());
    await rejected("ledger_entries_sub_order_link", () =>
      owner.insert(ledgerEntries).values(entry(supplier1, "sale", 1210, null)),
    );
    await rejected("ledger_entries_sub_order_link", () =>
      owner
        .insert(ledgerEntries)
        .values(entry(supplier1, "commission_payment", 80, sub)),
    );
  });

  it("books each sub-order entry at most once (retries cannot double-book)", async () => {
    const sub = await insertSubOrder(await insertOrder());
    await owner
      .insert(ledgerEntries)
      .values(entry(supplier1, "sale", 1210, sub));
    await rejected("ledger_entries_once_per_sub_order_uq", () =>
      owner.insert(ledgerEntries).values(entry(supplier1, "sale", 1210, sub)),
    );
    // … but payments and payouts are not tied to a sub-order and may repeat.
    await owner
      .insert(ledgerEntries)
      .values(entry(supplier1, "commission_payment", 10));
    await owner
      .insert(ledgerEntries)
      .values(entry(supplier1, "commission_payment", 10));
  });

  it("lets a balance go negative: a direct-mode supplier owes its commission", async () => {
    const sub = await insertSubOrder(await insertOrder({ ...money(30000) }), {
      mode: "direct",
      ...money(30000),
      commissionCents: 2400,
    });
    await owner
      .insert(ledgerEntries)
      .values(entry(supplier2, "commission", -2400, sub));
    const [row] = (
      await owner.execute<{ balance: string }>(
        sql`select coalesce(sum(amount_cents), 0) as balance from ledger_entries where sub_order_id = ${sub}`,
      )
    ).rows;
    expect(Number(row!.balance)).toBe(-2400);
  });
});

// ── grants ──────────────────────────────────────────────────────────────────

describe("grants: the web login", () => {
  it("inserts an order and takes an order number from the sequence", async () => {
    const id = await withTx(actor, async (tx) => {
      const seq = (
        await tx.execute<{ n: string }>(
          sql`select nextval('order_number_seq') as n`,
        )
      ).rows[0]!.n;
      expect(Number(seq)).toBeGreaterThan(0);
      const [row] = await tx
        .insert(orders)
        .values(newOrder())
        .returning({ id: orders.id });
      return row!.id;
    });
    expect(id).toBeTruthy();
  });

  it("cannot UPDATE an order (its status is written only by recompute_order)", async () => {
    const id = await insertOrder();
    await failsWith("42501", () =>
      withTx(actor, (tx) =>
        tx.execute(
          sql`update orders set status = 'completed' where id = ${id}`,
        ),
      ),
    );
  });

  it("updates the four transition columns of a sub-order, never its money, mode or submission", async () => {
    const sub = await insertSubOrder(await insertOrder());
    await withTx(actor, (tx) =>
      tx.execute(
        sql`update sub_orders set status = 'cancelled', cancel_reason = 'test', cancelled_by_user_id = ${userId}, status_changed_at = now() where id = ${sub}`,
      ),
    );
    for (const set of [
      sql`net_cents = 1`,
      sql`gross_cents = 1`,
      sql`commission_cents = 1`,
      sql`commission_bps = 1`,
      sql`mode = 'direct'`,
      sql`supplier_submission = 'accepted'`,
      sql`order_payment_status = 'paid'`,
      sql`buyer_org_id = ${buyerB}`,
    ])
      await failsWith("42501", () =>
        withTx(actor, (tx) =>
          tx.execute(sql`update sub_orders set ${set} where id = ${sub}`),
        ),
      );
  });

  it("cannot change or delete rows of the append-only tables", async () => {
    const orderId = await insertOrder();
    const sub = await insertSubOrder(orderId);
    await owner.insert(orderLines).values(newLine(sub));
    await owner
      .insert(ledgerEntries)
      .values(entry(supplier1, "sale", 1210, sub));
    await owner.insert(subOrderEvents).values({
      subOrderId: sub,
      buyerOrgId: buyerA,
      supplierOrgId: supplier1,
      toStatus: "pending",
    });
    await owner.insert(auditLog).values({
      actorUserId: userId,
      action: "test.action",
      entityType: "test",
      entityId: "1",
    });
    const statements = [
      sql`update ledger_entries set amount_cents = 1 where sub_order_id = ${sub}`,
      sql`delete from ledger_entries where sub_order_id = ${sub}`,
      sql`update order_lines set quantity = 5 where sub_order_id = ${sub}`,
      sql`delete from order_lines where sub_order_id = ${sub}`,
      sql`update sub_order_events set note = 'x' where sub_order_id = ${sub}`,
      sql`delete from sub_order_events where sub_order_id = ${sub}`,
      sql`update audit_log set action = 'x' where actor_user_id = ${userId}`,
      sql`delete from audit_log where actor_user_id = ${userId}`,
      sql`update order_payments set amount_cents = 1`,
      sql`delete from order_payments`,
      sql`update proforma_invoices set gross_cents = 1`,
      sql`delete from proforma_invoices`,
      sql`delete from orders where id = ${orderId}`,
      sql`delete from sub_orders where id = ${sub}`,
    ];
    for (const statement of statements)
      await failsWith("42501", () =>
        withTx(actor, (tx) => tx.execute(statement)),
      );
  });

  it("can empty a cart (cart lines are deleted at checkout) and read the settings", async () => {
    const [cart] = await owner
      .insert(carts)
      .values({ buyerOrgId: buyerB })
      .returning({ id: carts.id });
    const [item] = await owner
      .insert(cartItems)
      .values({
        cartId: cart!.id,
        buyerOrgId: buyerB,
        productId,
        quantity: 1,
        unitPriceCentsSeen: 500,
        addedByUserId: userId,
      })
      .returning({ id: cartItems.id });
    await withTx(actor, (tx) =>
      tx.delete(cartItems).where(eq(cartItems.id, item!.id)),
    );
    await rejected("cart_items_quantity_positive", () =>
      owner.insert(cartItems).values({
        cartId: cart!.id,
        buyerOrgId: buyerB,
        productId,
        quantity: 0,
        unitPriceCentsSeen: 500,
        addedByUserId: userId,
      }),
    );
    await withTx(actor, (tx) => tx.select().from(settings).limit(1));
  });
});

describe("grants: the worker login", () => {
  it("updates supplier_submission only", async () => {
    const sub = await insertSubOrder(await insertOrder());
    await withSystemTx((tx) =>
      tx.execute(
        sql`update sub_orders set supplier_submission = 'accepted' where id = ${sub}`,
      ),
    );
    for (const set of [
      sql`status = 'cancelled'`,
      sql`net_cents = 1`,
      sql`mode = 'direct'`,
    ])
      await failsWith("42501", () =>
        withSystemTx((tx) =>
          tx.execute(sql`update sub_orders set ${set} where id = ${sub}`),
        ),
      );
  });

  it("updates the PDF columns of a pro-forma, never its totals; and cannot create one", async () => {
    const orderId = await insertOrder();
    await owner.insert(proformaInvoices).values({
      orderId,
      buyerOrgId: buyerA,
      number: unique("PF"),
      issuerSnapshot: {},
      buyerSnapshot: {},
      contentSnapshot: {},
      vatBreakdown: [],
      ...money(),
      dueDate: "2026-12-31",
      paymentReference: "ref",
    });
    await withSystemTx((tx) =>
      tx.execute(
        sql`update proforma_invoices set storage_key = 'pf/1.pdf', pdf_generated_at = now() where order_id = ${orderId}`,
      ),
    );
    await failsWith("42501", () =>
      withSystemTx((tx) =>
        tx.execute(
          sql`update proforma_invoices set gross_cents = 1 where order_id = ${orderId}`,
        ),
      ),
    );
    await failsWith("42501", () =>
      withSystemTx((tx) =>
        tx.execute(
          sql`insert into proforma_invoices (order_id, buyer_org_id, number, issuer_snapshot, buyer_snapshot, content_snapshot, vat_breakdown, net_cents, vat_cents, gross_cents, due_date, payment_reference) values (${orderId}, ${buyerA}, 'x', '{}', '{}', '{}', '[]', 1, 0, 1, '2026-12-31', 'r')`,
        ),
      ),
    );
  });

  it("reads orders and settings, writes audit entries without a user, and writes no ledger or order", async () => {
    await withSystemTx((tx) => tx.select().from(orders).limit(1));
    await withSystemTx((tx) => tx.select().from(settings).limit(1));
    await withSystemTx((tx) =>
      tx.insert(auditLog).values({
        action: "payment.received",
        entityType: "payment",
        entityId: "1",
      }),
    );
    await owner.execute(
      sql`delete from audit_log where action = 'payment.received' and actor_user_id is null`,
    );
    await failsWith("42501", () =>
      withSystemTx((tx) =>
        tx.insert(ledgerEntries).values(entry(supplier1, "adjustment", 1)),
      ),
    );
    await failsWith("42501", () =>
      withSystemTx((tx) => tx.insert(orders).values(newOrder())),
    );
    await failsWith("42501", () =>
      withSystemTx((tx) =>
        tx.execute(sql`update orders set status = 'completed'`),
      ),
    );
  });
});

// ── settings seed ───────────────────────────────────────────────────────────

describe("settings seed", () => {
  const read = async (key: string) =>
    (await owner.select().from(settings).where(eq(settings.key, key)))[0];

  it("creates the four settings with the documented values", async () => {
    await owner.transaction((tx) => seedSettings(tx));
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS))
      expect((await read(key))?.value, key).toEqual(value);
    expect((await read("default_commission_bps"))?.value).toBe(800);
    expect((await read("invoice_due_days"))?.value).toBe(8); // one integer, not an object
    expect((await read("vat_rates_bps"))?.value).toEqual([2100, 1500, 700, 0]);
  });

  it("is idempotent and never overwrites a value the admin changed", async () => {
    await owner.execute(
      sql`update settings set value = '650'::jsonb where key = 'default_commission_bps'`,
    );
    try {
      const again = await owner.transaction((tx) => seedSettings(tx));
      expect(again.settingsInserted).toBe(0);
      expect((await read("default_commission_bps"))?.value).toBe(650);
    } finally {
      await owner.execute(
        sql`update settings set value = '800'::jsonb where key = 'default_commission_bps'`,
      );
    }
  });
});
