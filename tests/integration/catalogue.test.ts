/**
 * Catalogue migration 0003 against a real, migrated Postgres (D3-B2): the CHECK constraints and unique
 * indexes reject bad rows, the grants give each login exactly what rls.sql §3 + APPLIED.md say, and the
 * seed is idempotent. RLS is not enabled yet (D4-B2), so these tests prove constraints and grants only.
 *
 * Fixtures are committed as horeca_owner (the migration login) and removed in afterAll.
 */
import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/env.core";
import { closeDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { flattenCategories } from "@/server/db/seed/catalogue-data";
import { seedCatalogue } from "@/server/db/seed/catalogue";
import { pgError, rejected } from "./helpers";
import { withSystemTx, withTx, type RlsContext } from "@/server/db/tx";

const ownerPool = new Pool({ connectionString: env.DATABASE_MIGRATE_URL });
const owner = drizzle(ownerPool, { schema });

const run = randomBytes(4).toString("hex");
const supplierA = `t_supA_${run}`;
const supplierB = `t_supB_${run}`;
const userId = `t_user_${run}`;
const actor: RlsContext = {
  userId,
  orgId: supplierA,
  orgType: "supplier",
  role: "owner",
};

let leafId: string; // refrigeration.under_counter
let productId: string;
let imageId: string;

const baseProduct = (over: Record<string, unknown> = {}) => ({
  supplierOrgId: supplierA,
  categoryId: leafId,
  sku: `SKU-${randomBytes(4).toString("hex")}`,
  name: "Podpultni frižider 2 vrata",
  basePriceCents: 48900,
  vatRateBps: 2100,
  ...over,
});

beforeAll(async () => {
  const now = new Date();
  await owner.insert(schema.user).values({
    id: userId,
    name: "Test",
    email: `${userId}@example.test`,
  });
  await owner.insert(schema.organization).values([
    { id: supplierA, name: "A", slug: supplierA, createdAt: now },
    { id: supplierB, name: "B", slug: supplierB, createdAt: now },
  ]);
  await owner.transaction((tx) => seedCatalogue(tx));
  const [leaf] = await owner
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      sql`${schema.categories.path} = 'refrigeration.under_counter'::ltree`,
    );
  leafId = leaf!.id;
  const [p] = await owner
    .insert(schema.products)
    .values(baseProduct({ sku: "FIXTURE-1" }))
    .returning({ id: schema.products.id });
  productId = p!.id;
  const [img] = await owner
    .insert(schema.productImages)
    .values({
      productId,
      supplierOrgId: supplierA,
      position: 0,
      originalKey: "orig/x",
      contentType: "image/png",
      sizeBytes: 1000,
    })
    .returning({ id: schema.productImages.id });
  imageId = img!.id;
});

afterAll(async () => {
  await owner.execute(
    sql`delete from product_images where supplier_org_id in (${supplierA}, ${supplierB})`,
  );
  await owner.execute(
    sql`delete from products where supplier_org_id in (${supplierA}, ${supplierB})`,
  );
  await owner.execute(
    sql`delete from csv_imports where supplier_org_id in (${supplierA}, ${supplierB})`,
  );
  await owner.execute(
    sql`delete from organization where id in (${supplierA}, ${supplierB})`,
  );
  await owner.execute(sql`delete from "user" where id = ${userId}`);
  await ownerPool.end();
  await closeDb();
});

describe("product constraints", () => {
  it.each([
    ["products_price_positive", { basePriceCents: 0 }],
    ["products_vat_range", { vatRateBps: 10001 }],
    ["products_qty_rules", { minOrderQty: 6, orderStep: 4 }],
    ["products_gtin_format", { gtin: "12345" }],
  ])("rejects a row that breaks %s", async (constraint, over) => {
    await rejected(constraint, () =>
      owner.insert(schema.products).values(baseProduct(over)),
    );
  });

  it("accepts the same SKU at two suppliers but not twice at one", async () => {
    await owner
      .insert(schema.products)
      .values(baseProduct({ supplierOrgId: supplierB, sku: "FIXTURE-1" }));
    await rejected("products_supplier_sku_uq", () =>
      owner.insert(schema.products).values(baseProduct({ sku: "FIXTURE-1" })),
    );
  });

  it("accepts a minimum that is a multiple of the order step", async () => {
    await owner
      .insert(schema.products)
      .values(baseProduct({ minOrderQty: 12, orderStep: 6, gtin: "12345678" }));
  });
});

describe("image, category and attribute constraints", () => {
  const image = (over: Record<string, unknown>) => ({
    productId,
    supplierOrgId: supplierA,
    position: 1,
    originalKey: "orig/y",
    contentType: "image/png",
    sizeBytes: 1000,
    ...over,
  });

  it.each([
    ["product_images_size", { sizeBytes: 5 * 1024 * 1024 + 1 }],
    ["product_images_type", { contentType: "image/gif" }],
    ["product_images_position", { position: 8 }],
    ["product_images_product_position_uq", { position: 0 }],
  ])("rejects an image that breaks %s", async (constraint, over) => {
    await rejected(constraint, () =>
      owner.insert(schema.productImages).values(image(over)),
    );
  });

  it("rejects a fourth level in the category tree and a root with a parent", async () => {
    await rejected("categories_depth_range", () =>
      owner.insert(schema.categories).values({
        parentId: leafId,
        path: "refrigeration.under_counter.too_deep",
        slug: "too-deep",
        name: "x",
        depth: 4,
      }),
    );
    await rejected("categories_root_depth", () =>
      owner.insert(schema.categories).values({
        parentId: leafId,
        path: "x_root",
        slug: "x-root",
        name: "x",
        depth: 1,
      }),
    );
  });

  it("rejects an enum attribute without options and min/max on a non-number", async () => {
    await rejected("category_attributes_enum_options", () =>
      owner.insert(schema.categoryAttributes).values({
        categoryId: leafId,
        key: "colour_x",
        label: "x",
        type: "enum",
      }),
    );
    await rejected("category_attributes_minmax_number_only", () =>
      owner.insert(schema.categoryAttributes).values({
        categoryId: leafId,
        key: "flag_x",
        label: "x",
        type: "boolean",
        minValue: "1",
      }),
    );
  });
});

describe("CSV imports", () => {
  const csv = (supplierOrgId: string, status: string) => ({
    supplierOrgId,
    categoryId: leafId,
    createdByUserId: userId,
    fileKey: "f",
    filename: "f.csv",
    status: status as "uploaded",
  });

  it("allows one active import per supplier, and another once it is finished", async () => {
    const [first] = await owner
      .insert(schema.csvImports)
      .values(csv(supplierB, "validating"))
      .returning({ id: schema.csvImports.id });
    await rejected("csv_imports_one_active_uq", () =>
      owner.insert(schema.csvImports).values(csv(supplierB, "uploaded")),
    );
    await owner.execute(
      sql`update csv_imports set status = 'completed' where id = ${first!.id}`,
    );
    await owner.insert(schema.csvImports).values(csv(supplierB, "uploaded"));
  });

  it("rejects counts that do not add up or exceed 5000 rows", async () => {
    await rejected("csv_imports_counts", () =>
      owner.insert(schema.csvImports).values({
        ...csv(supplierA, "failed"),
        totalRows: 5001,
        validRows: 5001,
      }),
    );
  });
});

describe("grants", () => {
  it("lets the web login read and write the catalogue but never delete a product", async () => {
    const found = await withTx(actor, (tx) =>
      tx
        .select({ id: schema.products.id })
        .from(schema.products)
        .where(sql`id = ${productId}`),
    );
    expect(found).toHaveLength(1);
    await withTx(actor, (tx) =>
      tx.execute(
        sql`update products set name = 'Promijenjeno' where id = ${productId}`,
      ),
    );
    const err = await withTx(actor, (tx) =>
      tx.execute(sql`delete from products where id = ${productId}`),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(pgError(err).code).toBe("42501"); // insufficient_privilege
  });

  it("lets the web login delete a product image", async () => {
    const [extra] = await owner
      .insert(schema.productImages)
      .values({
        productId,
        supplierOrgId: supplierA,
        position: 5,
        originalKey: "orig/z",
        contentType: "image/webp",
        sizeBytes: 10,
      })
      .returning({ id: schema.productImages.id });
    await withTx(actor, (tx) =>
      tx.execute(sql`delete from product_images where id = ${extra!.id}`),
    );
  });

  it("lets the worker update only status, width and height of an image", async () => {
    await withSystemTx((tx) =>
      tx.execute(
        sql`update product_images set status = 'ready', width = 1280, height = 960 where id = ${imageId}`,
      ),
    );
    for (const column of ["original_key", "alt", "position", "size_bytes"]) {
      const value =
        column === "position" || column === "size_bytes" ? sql`3` : sql`'x'`;
      const err = await withSystemTx((tx) =>
        tx.execute(
          sql`update product_images set ${sql.identifier(column)} = ${value} where id = ${imageId}`,
        ),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(pgError(err).code, column).toBe("42501");
    }
  });

  it("gives the worker read-only access to products and CSV imports", async () => {
    await withSystemTx((tx) => tx.select().from(schema.products).limit(1));
    for (const statement of [
      sql`update products set name = 'x' where id = ${productId}`,
      sql`insert into csv_imports (supplier_org_id, category_id, created_by_user_id, file_key, filename) values (${supplierA}, ${leafId}, ${userId}, 'f', 'f')`,
      sql`update csv_imports set status = 'failed'`,
    ]) {
      const err = await withSystemTx((tx) => tx.execute(statement)).then(
        () => null,
        (e: unknown) => e,
      );
      expect(pgError(err).code).toBe("42501");
    }
  });
});

describe("catalogue seed", () => {
  const flat = flattenCategories();
  const countRows = async () => {
    const [c] = (
      await owner.execute<{ n: string }>(
        sql`select count(*) as n from categories`,
      )
    ).rows;
    const [a] = (
      await owner.execute<{ n: string }>(
        sql`select count(*) as n from category_attributes`,
      )
    ).rows;
    return [Number(c!.n), Number(a!.n)];
  };

  it("created the whole tree and every definition", async () => {
    const [categoryCount, attributeCount] = await countRows();
    expect(categoryCount).toBeGreaterThanOrEqual(flat.length);
    expect(attributeCount).toBeGreaterThanOrEqual(46);
    const row = (
      await owner.execute<{ name: string; parent: string }>(sql`
        select c.name, p.path::text as parent
        from categories c join categories p on p.id = c.parent_id
        where c.path = 'kitchen_equipment.cooking.combi_ovens'::ltree`)
    ).rows[0];
    expect(row).toEqual({
      name: "Kombinovane pećnice",
      parent: "kitchen_equipment.cooking",
    });
  });

  it("is idempotent: a second run inserts nothing", async () => {
    const before = await countRows();
    const result = await owner.transaction((tx) => seedCatalogue(tx));
    expect(result).toEqual({ categoriesInserted: 0, attributesInserted: 0 });
    expect(await countRows()).toEqual(before);
  });

  it("never overwrites what an admin changed", async () => {
    await owner.execute(
      sql`update categories set name = 'Izmijenjeno' where path = 'bar.blenders'::ltree`,
    );
    try {
      await owner.transaction((tx) => seedCatalogue(tx));
      const [row] = (
        await owner.execute<{ name: string }>(
          sql`select name from categories where path = 'bar.blenders'::ltree`,
        )
      ).rows;
      expect(row!.name).toBe("Izmijenjeno");
    } finally {
      await owner.execute(
        sql`update categories set name = 'Blenderi' where path = 'bar.blenders'::ltree`,
      );
    }
  });
});
