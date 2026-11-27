/**
 * Product services (D5-B3a) against a real, migrated Postgres with RLS on: every call goes through
 * withTx(actor), so the policies of migration 0005 are the second line behind policy.can.
 *
 * Fixtures are committed as horeca_owner and removed in afterAll. The category tree has its own root and
 * attributes (suffix `run`), so no test depends on — or changes — the shared seed catalogue.
 */
import { randomBytes, randomInt } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/env.core";
import type { CreateProductInput } from "@/lib/schemas/product";
import { closeDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { seedSettings } from "@/server/db/seed/settings";
import { withTx, type Tx } from "@/server/db/tx";
import type { Actor } from "@/server/domain/actor";
import { Conflict, NotFound, Validation } from "@/server/domain/errors";
import {
  createProduct,
  getProduct,
  listProducts,
  setProductStatus,
  updateProduct,
} from "@/server/domain/products";

const ownerPool = new Pool({ connectionString: env.DATABASE_MIGRATE_URL });
const owner = drizzle(ownerPool, { schema });
const { products, categories, categoryAttributes, orgProfiles } = schema;

const run = randomBytes(4).toString("hex");
const supplierA = `t_pA_${run}`;
const supplierB = `t_pB_${run}`;
const supplierS = `t_pS_${run}`; // suspended
const buyer = `t_pBuy_${run}`;
const platformOrg = `t_pPlat_${run}`;
const orgIds = [supplierA, supplierB, supplierS, buyer];

const actor = (
  orgId: string,
  orgType: Actor["orgType"],
  role: Actor["role"] = "owner",
): Actor => ({ userId: `u_${orgId}_${role}`, orgId, orgType, role });
const ownerA = actor(supplierA, "supplier");
const memberA = actor(supplierA, "supplier", "member");
const ownerB = actor(supplierB, "supplier");
const suspended = actor(supplierS, "supplier");
const buyerActor = actor(buyer, "buyer");
const platformActor = actor(platformOrg, "platform");

const as = <T>(a: Actor, fn: (tx: Tx) => Promise<T>) => withTx(a, fn);

/** A random 8-digit PIB (the tax ID is unique per organization type). */
const taxId = () => String(randomInt(10_000_000, 99_999_999));

let rootId: string; // not a leaf
let leafId: string; // required: capacity_l 50–800 · optional: finish (enum) · inherited from the root: weight_kg (optional)
let otherLeafId: string; // required: voltage_v
let inactiveLeafId: string; // an inactive category

let n = 0;
const unique = (label: string) => `${label}-${run}-${(n += 1)}`;

const input = (over: Partial<CreateProductInput> = {}): CreateProductInput => ({
  sku: unique("SKU"),
  categoryId: leafId,
  name: "Podpultni frižider",
  unit: "piece",
  minOrderQty: 1,
  orderStep: 1,
  basePriceCents: 48900,
  vatRateBps: 2100,
  attributes: { capacity_l: 150 },
  ...over,
});

/** The error a promise rejects with (fails the test if it resolves). */
async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail, but it succeeded");
}

async function validation(promise: Promise<unknown>): Promise<Validation> {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(Validation);
  return error as Validation;
}

/** Inserts a product as the owner (any status, any supplier) — for the states a test needs to start from. */
async function seedProduct(
  over: Partial<typeof products.$inferInsert> = {},
): Promise<typeof products.$inferSelect> {
  const [row] = await owner
    .insert(products)
    .values({
      supplierOrgId: supplierA,
      categoryId: leafId,
      sku: unique("FIX"),
      name: "Fixture",
      basePriceCents: 1000,
      vatRateBps: 2100,
      attributes: { capacity_l: 100 },
      ...over,
    })
    .returning();
  return row!;
}

const dbProduct = async (id: string) =>
  (await owner.select().from(products).where(eq(products.id, id)))[0];

beforeAll(async () => {
  const now = new Date();
  await owner
    .insert(schema.organization)
    .values(orgIds.map((id) => ({ id, name: id, slug: id, createdAt: now })));
  await owner.insert(orgProfiles).values(
    orgIds.map((id) => ({
      organizationId: id,
      type: id === buyer ? ("buyer" as const) : ("supplier" as const),
      status: id === supplierS ? ("suspended" as const) : ("approved" as const),
      legalName: `Firma ${id}`,
      taxId: taxId(),
      addressLine: "Ulica 1",
      city: "Podgorica",
      postalCode: "81000",
      contactEmail: `${id}@example.test`,
    })),
  );
  await owner.transaction((tx) => seedSettings(tx)); // vat_rates_bps; idempotent

  const path = `tp_${run}`;
  const cat = async (
    parentId: string | null,
    label: string,
    depth: number,
    isActive = true,
  ) => {
    const [row] = await owner
      .insert(categories)
      .values({
        parentId,
        path: parentId ? `${path}.${label}` : path,
        slug: `${path}-${label}`,
        name: label,
        depth,
        isActive,
      })
      .returning({ id: categories.id });
    return row!.id;
  };
  rootId = await cat(null, "root", 1);
  leafId = await cat(rootId, "leaf", 2);
  otherLeafId = await cat(rootId, "other", 2);
  inactiveLeafId = await cat(rootId, "dead", 2, false);

  const attr = (
    categoryId: string,
    a: Partial<typeof categoryAttributes.$inferInsert> & { key: string },
  ) => ({
    categoryId,
    label: a.key,
    type: "number" as const,
    position: 0,
    ...a,
  });
  await owner.insert(categoryAttributes).values([
    attr(rootId, {
      key: "weight_kg",
      unit: "kg",
      minValue: "0",
      maxValue: "500",
    }),
    attr(leafId, {
      key: "capacity_l",
      unit: "l",
      required: true,
      minValue: "50",
      maxValue: "800",
    }),
    attr(leafId, {
      key: "finish",
      type: "enum",
      options: [
        { value: "matte", label: "Mat" },
        { value: "gloss", label: "Sjaj" },
      ],
    }),
    attr(leafId, { key: "old_attr", isActive: false }),
    attr(otherLeafId, { key: "voltage_v", unit: "V", required: true }),
  ]);
});

afterAll(async () => {
  await owner.execute(
    sql`delete from products where supplier_org_id in (${sql.join(
      orgIds.map((o) => sql`${o}`),
      sql`, `,
    )})`,
  );
  await owner.execute(
    sql`delete from category_attributes where category_id in (select id from categories where path <@ ${`tp_${run}`}::ltree)`,
  );
  await owner.execute(
    sql`delete from categories where path <@ ${`tp_${run}`}::ltree and depth = 2`,
  );
  await owner.execute(
    sql`delete from categories where path = ${`tp_${run}`}::ltree`,
  );
  await owner
    .delete(orgProfiles)
    .where(inArray(orgProfiles.organizationId, orgIds));
  await owner
    .delete(schema.organization)
    .where(inArray(schema.organization.id, orgIds));
  await ownerPool.end();
  await closeDb();
});

// ───────────────────────── createProduct ─────────────────────────

describe("createProduct", () => {
  it("creates a draft for the actor's own organization, with the values as given", async () => {
    const created = await as(ownerA, (tx) =>
      createProduct(
        tx,
        ownerA,
        input({
          sku: "RF-150",
          description: "  Tihi rad ",
          gtin: "12345670",
          attributes: { capacity_l: 150, finish: "matte", weight_kg: 42.5 },
        }),
      ),
    );
    expect(created).toMatchObject({
      supplierOrgId: supplierA,
      status: "draft",
      sku: "RF-150",
      description: "Tihi rad",
      gtin: "12345670",
      basePriceCents: 48900,
      vatRateBps: 2100,
      attributes: { capacity_l: 150, finish: "matte", weight_kg: 42.5 },
    });
    expect((await dbProduct(created.id))?.status).toBe("draft");
  });

  it("a supplier MEMBER may create products too (matrix: S*)", async () => {
    const created = await as(memberA, (tx) =>
      createProduct(tx, memberA, input()),
    );
    expect(created.supplierOrgId).toBe(supplierA);
  });

  it("a draft may be incomplete: the required attribute can be added later", async () => {
    const created = await as(ownerA, (tx) =>
      createProduct(tx, ownerA, input({ attributes: {} })),
    );
    expect(created.attributes).toEqual({});
  });

  it("the same SKU twice in one supplier → Conflict SKU_TAKEN; another supplier may use it", async () => {
    const sku = unique("DUP");
    await as(ownerA, (tx) => createProduct(tx, ownerA, input({ sku })));
    const error = await failure(
      as(ownerA, (tx) => createProduct(tx, ownerA, input({ sku }))),
    );
    expect(error).toBeInstanceOf(Conflict);
    expect((error as Conflict).reason).toBe("SKU_TAKEN");
    const other = await as(ownerB, (tx) =>
      createProduct(tx, ownerB, input({ sku })),
    );
    expect(other.supplierOrgId).toBe(supplierB);
  });

  it("a buyer or the platform cannot create products (not found: another area)", async () => {
    for (const a of [buyerActor, platformActor]) {
      expect(
        await failure(as(a, (tx) => createProduct(tx, a, input()))),
      ).toBeInstanceOf(NotFound);
    }
  });

  it("rejects fields we did not name (no mass assignment) and saves nothing", async () => {
    const sku = unique("MASS");
    const error = await validation(
      as(ownerA, (tx) =>
        createProduct(tx, ownerA, {
          ...input({ sku }),
          status: "active",
          supplierOrgId: supplierB,
        } as unknown as CreateProductInput),
      ),
    );
    expect(Object.keys(error.fieldErrors).sort()).toEqual([
      "status",
      "supplierOrgId",
    ]);
    expect(
      await owner.select().from(products).where(eq(products.sku, sku)),
    ).toHaveLength(0);
  });

  it("the category must be an active leaf that exists", async () => {
    for (const categoryId of [
      rootId, // has sub-categories
      inactiveLeafId,
      "99999999-9999-4999-8999-999999999999", // does not exist
    ]) {
      const error = await validation(
        as(ownerA, (tx) => createProduct(tx, ownerA, input({ categoryId }))),
      );
      expect(error.fieldErrors).toHaveProperty("categoryId");
    }
  });

  it("the VAT rate must be one of settings.vat_rates_bps", async () => {
    const error = await validation(
      as(ownerA, (tx) =>
        createProduct(tx, ownerA, input({ vatRateBps: 1999 })),
      ),
    );
    expect(error.fieldErrors).toHaveProperty("vatRateBps");
    for (const vatRateBps of [2100, 1500, 700, 0]) {
      await as(ownerA, (tx) =>
        createProduct(tx, ownerA, input({ vatRateBps })),
      );
    }
  });

  it("attributes: unknown key, out-of-range number, bad enum and a deactivated key are rejected — inherited ones are accepted", async () => {
    const bad = (attributes: CreateProductInput["attributes"]) =>
      validation(
        as(ownerA, (tx) => createProduct(tx, ownerA, input({ attributes }))),
      );

    expect(
      (await bad({ capacity_l: 150, colour: "red" })).fieldErrors,
    ).toHaveProperty(["attributes.colour"]);
    expect((await bad({ capacity_l: 10 })).fieldErrors).toHaveProperty([
      "attributes.capacity_l",
    ]);
    expect((await bad({ finish: "wood" })).fieldErrors).toHaveProperty([
      "attributes.finish",
    ]);
    expect((await bad({ old_attr: 1 })).fieldErrors).toHaveProperty([
      "attributes.old_attr",
    ]);
    // weight_kg belongs to the ROOT category and is inherited by the leaf.
    expect((await bad({ weight_kg: 900 })).fieldErrors).toHaveProperty([
      "attributes.weight_kg",
    ]);
    await as(ownerA, (tx) =>
      createProduct(tx, ownerA, input({ attributes: { weight_kg: 12 } })),
    );
  });

  it("a suspended supplier gets a Conflict (409), not a silent RLS failure", async () => {
    expect(
      await failure(
        as(suspended, (tx) => createProduct(tx, suspended, input())),
      ),
    ).toBeInstanceOf(Conflict);
  });
});

// ───────────────────────── updateProduct ─────────────────────────

describe("updateProduct", () => {
  const editable = (over: Partial<CreateProductInput> = {}) => {
    const fields: Partial<CreateProductInput> = input(over);
    delete fields.sku; // the SKU never changes after creation
    return fields as Omit<CreateProductInput, "sku">;
  };

  it("replaces the editable fields; the SKU, the supplier and the status stay", async () => {
    const p = await seedProduct({ sku: unique("UPD") });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await as(memberA, (tx) =>
      updateProduct(
        tx,
        memberA,
        p.id,
        editable({
          name: "Novi naziv",
          basePriceCents: 52000,
          vatRateBps: 1500,
        }),
      ),
    );
    expect(updated).toMatchObject({
      sku: p.sku,
      supplierOrgId: supplierA,
      status: "draft",
      name: "Novi naziv",
      basePriceCents: 52000,
      vatRateBps: 1500,
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(p.updatedAt.getTime());
  });

  it("another supplier's product, a missing one, a buyer and the platform → NotFound; nothing changes", async () => {
    const p = await seedProduct({ status: "active" });
    const attempts: [Actor, string][] = [
      [ownerB, p.id],
      [ownerA, "99999999-9999-4999-8999-999999999999"],
      [buyerActor, p.id],
      [platformActor, p.id],
    ];
    for (const [a, id] of attempts) {
      expect(
        await failure(
          as(a, (tx) => updateProduct(tx, a, id, editable({ name: "HACK" }))),
        ),
      ).toBeInstanceOf(NotFound);
    }
    expect((await dbProduct(p.id))?.name).toBe("Fixture");
  });

  it("an archived product cannot be edited", async () => {
    const p = await seedProduct({ status: "archived" });
    expect(
      await failure(
        as(ownerA, (tx) => updateProduct(tx, ownerA, p.id, editable())),
      ),
    ).toBeInstanceOf(Conflict);
  });

  it("an ACTIVE product must stay complete; a draft need not", async () => {
    const live = await seedProduct({ status: "active" });
    const error = await validation(
      as(ownerA, (tx) =>
        updateProduct(tx, ownerA, live.id, editable({ attributes: {} })),
      ),
    );
    expect(error.fieldErrors).toHaveProperty(["attributes.capacity_l"]);

    const draft = await seedProduct();
    await as(ownerA, (tx) =>
      updateProduct(tx, ownerA, draft.id, editable({ attributes: {} })),
    );
  });

  it("keeps the value of a deactivated attribute while replacing the rest", async () => {
    const p = await seedProduct({
      attributes: { capacity_l: 100, old_attr: 7 },
    });
    const updated = await as(ownerA, (tx) =>
      updateProduct(
        tx,
        ownerA,
        p.id,
        editable({ attributes: { capacity_l: 200 } }),
      ),
    );
    expect(updated.attributes).toEqual({ capacity_l: 200, old_attr: 7 });
  });

  it("moving to another category re-validates against ITS attributes and drops the old ones", async () => {
    const p = await seedProduct();
    const error = await validation(
      as(ownerA, (tx) =>
        updateProduct(tx, ownerA, p.id, editable({ categoryId: otherLeafId })),
      ),
    ); // capacity_l is not an attribute of the other leaf
    expect(error.fieldErrors).toHaveProperty(["attributes.capacity_l"]);

    const moved = await as(ownerA, (tx) =>
      updateProduct(
        tx,
        ownerA,
        p.id,
        editable({ categoryId: otherLeafId, attributes: { voltage_v: 230 } }),
      ),
    );
    expect(moved).toMatchObject({
      categoryId: otherLeafId,
      attributes: { voltage_v: 230 },
    });
  });

  it("a suspended supplier cannot edit (409)", async () => {
    const p = await seedProduct({ supplierOrgId: supplierS });
    expect(
      await failure(
        as(suspended, (tx) => updateProduct(tx, suspended, p.id, editable())),
      ),
    ).toBeInstanceOf(Conflict);
  });
});

// ───────────────────────── setProductStatus ─────────────────────────

describe("setProductStatus", () => {
  const set = (
    a: Actor,
    productId: string,
    event: "activate" | "deactivate" | "archive" | "restore",
  ) => as(a, (tx) => setProductStatus(tx, a, { productId, event }));

  it("walks the whole life: draft → active → draft → archived → draft", async () => {
    const p = await seedProduct();
    expect((await set(ownerA, p.id, "activate")).status).toBe("active");
    expect((await set(memberA, p.id, "deactivate")).status).toBe("draft");
    expect((await set(ownerA, p.id, "archive")).status).toBe("archived");
    expect((await set(ownerA, p.id, "restore")).status).toBe("draft");
    expect((await dbProduct(p.id))?.status).toBe("draft");
  });

  it("activating needs every required attribute; the product stays a draft otherwise", async () => {
    const p = await seedProduct({ attributes: {} });
    const error = await validation(set(ownerA, p.id, "activate"));
    expect(error.fieldErrors).toHaveProperty(["attributes.capacity_l"]);
    expect((await dbProduct(p.id))?.status).toBe("draft");
  });

  it("activating re-checks that the category is still an active leaf", async () => {
    const p = await seedProduct({
      categoryId: otherLeafId,
      attributes: { voltage_v: 230 },
    });
    await owner
      .update(categories)
      .set({ isActive: false })
      .where(eq(categories.id, otherLeafId));
    try {
      const error = await validation(set(ownerA, p.id, "activate"));
      expect(error.fieldErrors).toHaveProperty("categoryId");
    } finally {
      await owner
        .update(categories)
        .set({ isActive: true })
        .where(eq(categories.id, otherLeafId));
    }
  });

  it("an illegal change is a Conflict (archived → activate); the status is unchanged", async () => {
    const p = await seedProduct({ status: "archived" });
    expect(await failure(set(ownerA, p.id, "activate"))).toBeInstanceOf(
      Conflict,
    );
    expect((await dbProduct(p.id))?.status).toBe("archived");
  });

  it("another supplier's product, a buyer and the platform → NotFound; a suspended supplier → Conflict", async () => {
    const p = await seedProduct({ status: "active" });
    for (const a of [ownerB, buyerActor, platformActor]) {
      expect(await failure(set(a, p.id, "archive"))).toBeInstanceOf(NotFound);
    }
    expect((await dbProduct(p.id))?.status).toBe("active");

    const own = await seedProduct({ supplierOrgId: supplierS });
    expect(await failure(set(suspended, own.id, "archive"))).toBeInstanceOf(
      Conflict,
    );
  });

  it("an unknown event is a validation error", async () => {
    const p = await seedProduct();
    await validation(
      as(ownerA, (tx) =>
        setProductStatus(tx, ownerA, {
          productId: p.id,
          event: "delete" as "archive",
        }),
      ),
    );
  });
});

// ───────────────────────── getProduct ─────────────────────────

describe("getProduct (visibility = RLS: own in any status, others' only when active)", () => {
  it("the owner sees its own draft; another supplier and a buyer do not (NotFound)", async () => {
    const draft = await seedProduct();
    expect(
      (await as(ownerA, (tx) => getProduct(tx, ownerA, draft.id))).id,
    ).toBe(draft.id);
    for (const a of [ownerB, buyerActor]) {
      expect(
        await failure(as(a, (tx) => getProduct(tx, a, draft.id))),
      ).toBeInstanceOf(NotFound);
    }
  });

  it("an ACTIVE product of an approved supplier is visible to a buyer; the platform sees every status", async () => {
    const live = await seedProduct({ status: "active" });
    const archived = await seedProduct({ status: "archived" });
    expect(
      (await as(buyerActor, (tx) => getProduct(tx, buyerActor, live.id))).id,
    ).toBe(live.id);
    expect(
      await failure(
        as(buyerActor, (tx) => getProduct(tx, buyerActor, archived.id)),
      ),
    ).toBeInstanceOf(NotFound);
    expect(
      (
        await as(platformActor, (tx) =>
          getProduct(tx, platformActor, archived.id),
        )
      ).id,
    ).toBe(archived.id);
  });

  it("an active product of a SUSPENDED supplier disappears from buyers", async () => {
    const live = await seedProduct({
      supplierOrgId: supplierS,
      status: "active",
    });
    expect(
      await failure(
        as(buyerActor, (tx) => getProduct(tx, buyerActor, live.id)),
      ),
    ).toBeInstanceOf(NotFound);
  });
});

// ───────────────────────── listProducts ─────────────────────────

describe("listProducts (the supplier dashboard)", () => {
  // A fifth supplier keeps this block independent of the products the other tests created.
  const supplierL = `t_pL_${run}`;
  const lister = actor(supplierL, "supplier");

  beforeAll(async () => {
    await owner.insert(schema.organization).values({
      id: supplierL,
      name: supplierL,
      slug: supplierL,
      createdAt: new Date(),
    });
    await owner.insert(orgProfiles).values({
      organizationId: supplierL,
      type: "supplier",
      status: "approved",
      legalName: "Firma L",
      taxId: taxId(),
      addressLine: "Ulica 1",
      city: "Bar",
      postalCode: "85000",
      contactEmail: "l@example.test",
    });
    const mk = (
      sku: string,
      name: string,
      status: "draft" | "active" | "archived",
      ageMs: number,
    ) =>
      seedProduct({ supplierOrgId: supplierL, sku, name, status }).then((p) =>
        owner
          .update(products)
          .set({ updatedAt: new Date(Date.now() - ageMs) })
          .where(eq(products.id, p.id)),
      );
    await mk("L-1", "Pećnica 8 l", "active", 1000);
    await mk("L-2", "Frižider 150 l", "draft", 2000);
    await mk("L-3", "Popust 50% na tanjire", "active", 3000);
    await mk("L-4", "Popust 500 komada", "archived", 4000);
    await mk("L-5", "Čaša", "draft", 5000);
  });

  afterAll(async () => {
    await owner.delete(products).where(eq(products.supplierOrgId, supplierL));
    await owner
      .delete(orgProfiles)
      .where(eq(orgProfiles.organizationId, supplierL));
    await owner
      .delete(schema.organization)
      .where(eq(schema.organization.id, supplierL));
  });

  const list = (input: Parameters<typeof listProducts>[2] = {}) =>
    as(lister, (tx) => listProducts(tx, lister, input));

  it("lists only the actor's own products, the most recently changed first", async () => {
    const page = await list();
    expect(page.items.map((p) => p.sku)).toEqual([
      "L-1",
      "L-2",
      "L-3",
      "L-4",
      "L-5",
    ]);
    expect(page).toMatchObject({ total: 5, page: 1, pageSize: 25 });
  });

  it("does not list another supplier's products, even active ones that RLS lets it read", async () => {
    await seedProduct({ status: "active" }); // supplier A's, visible to everyone logged in
    const skus = (await list({ pageSize: 100 })).items.map((p) => p.sku);
    expect(skus).toHaveLength(5);
  });

  it("filters by status", async () => {
    expect((await list({ status: "active" })).items.map((p) => p.sku)).toEqual([
      "L-1",
      "L-3",
    ]);
    expect((await list({ status: "archived" })).total).toBe(1);
  });

  it("searches SKU and name, case-insensitively", async () => {
    expect((await list({ q: "fri" })).items.map((p) => p.sku)).toEqual(["L-2"]);
    expect((await list({ q: "l-3" })).items.map((p) => p.sku)).toEqual(["L-3"]);
  });

  it("treats % and _ in the search as plain characters", async () => {
    // "50%" must not behave like the LIKE pattern "50<anything>" and find "Popust 500 komada" too.
    expect((await list({ q: "50%" })).items.map((p) => p.sku)).toEqual(["L-3"]);
    expect((await list({ q: "L_1" })).total).toBe(0);
    expect((await list({ q: "\\" })).total).toBe(0);
  });

  it("pages the result and reports the total", async () => {
    const first = await list({ pageSize: 2 });
    const second = await list({ pageSize: 2, page: 2 });
    const last = await list({ pageSize: 2, page: 3 });
    expect(first.items.map((p) => p.sku)).toEqual(["L-1", "L-2"]);
    expect(second.items.map((p) => p.sku)).toEqual(["L-3", "L-4"]);
    expect(last.items.map((p) => p.sku)).toEqual(["L-5"]);
    expect([first.total, second.total, last.total]).toEqual([5, 5, 5]);
  });

  it("is for suppliers only: a buyer and the platform get NotFound", async () => {
    for (const a of [buyerActor, platformActor]) {
      expect(await failure(as(a, (tx) => listProducts(tx, a)))).toBeInstanceOf(
        NotFound,
      );
    }
  });

  it("rejects unknown query keys (a supplier id cannot be passed in)", async () => {
    await validation(
      as(lister, (tx) =>
        listProducts(tx, lister, {
          supplierOrgId: supplierA,
        } as unknown as Parameters<typeof listProducts>[2]),
      ),
    );
  });
});
