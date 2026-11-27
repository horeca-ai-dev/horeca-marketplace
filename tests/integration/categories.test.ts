/**
 * Category services (D5-B2) against a real, migrated Postgres with RLS on: every call goes through
 * withTx(actor). The test builds its OWN tree (suffix `run`) inside the shared table, so it neither depends
 * on nor changes the seed catalogue, and it looks its nodes up by id.
 *
 *   Root (active)                     weight_kg · old_flag (inactive attribute)
 *   ├─ Grupa A (active, position 0)   capacity_l (required) · finish (enum)
 *   │   ├─ List A1 (active)           doors
 *   │   └─ List A2 (INACTIVE)
 *   └─ Grupa B (INACTIVE, position 1)
 *       └─ List B1 (active, but under an inactive parent)
 */
import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/env.core";
import { closeDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { withTx, type Tx } from "@/server/db/tx";
import type { Actor } from "@/server/domain/actor";
import {
  getCategory,
  listCategoryTree,
  listLeafCategories,
} from "@/server/domain/categories";
import type { CategoryNode } from "@/server/domain/category-tree";
import { NotFound } from "@/server/domain/errors";

const ownerPool = new Pool({ connectionString: env.DATABASE_MIGRATE_URL });
const owner = drizzle(ownerPool, { schema });
const { categories, categoryAttributes } = schema;

const run = randomBytes(4).toString("hex");
const buyer: Actor = {
  userId: "u-buyer",
  orgId: `t_cat_b_${run}`,
  orgType: "buyer",
  role: "member",
};
const supplier: Actor = {
  userId: "u-sup",
  orgId: `t_cat_s_${run}`,
  orgType: "supplier",
  role: "owner",
};
const platform: Actor = {
  userId: "u-plat",
  orgId: `t_cat_p_${run}`,
  orgType: "platform",
  role: "owner",
};

const as = <T>(a: Actor, fn: (tx: Tx) => Promise<T>) => withTx(a, fn);

const ids: Record<"root" | "a" | "a1" | "a2" | "b" | "b1", string> =
  {} as never;
const rootPath = `tcat_${run}`;
/** ltree path of every node built so far: a child is `<parent path>.<label>`. */
const paths = {} as Record<string, string>;

async function category(
  key: keyof typeof ids,
  parent: keyof typeof ids | null,
  label: string,
  name: string,
  depth: number,
  over: { position?: number; isActive?: boolean } = {},
) {
  const [row] = await owner
    .insert(categories)
    .values({
      parentId: parent ? ids[parent] : null,
      path: parent ? `${paths[parent]}.${label}` : rootPath,
      slug: `${rootPath}-${label}`,
      name,
      depth,
      position: over.position ?? 0,
      isActive: over.isActive ?? true,
    })
    .returning({ id: categories.id });
  ids[key] = row!.id;
  paths[key] = parent ? `${paths[parent]}.${label}` : rootPath;
}

const attr = (
  categoryId: string,
  a: Partial<typeof categoryAttributes.$inferInsert> & {
    key: string;
    position: number;
  },
) => ({ categoryId, label: a.key, type: "number" as const, ...a });

/** Finds this test's root in the whole tree (the table also holds the seed and other tests' trees). */
const ownRoot = (tree: CategoryNode[]) => tree.find((n) => n.id === ids.root);
const flatIds = (n: CategoryNode): string[] => [
  n.id,
  ...n.children.flatMap(flatIds),
];

beforeAll(async () => {
  await category("root", null, "root", "Korijen", 1);
  await category("a", "root", "a", "Grupa A", 2, { position: 0 });
  await category("a1", "a", "a1", "List A1", 3);
  await category("a2", "a", "a2", "List A2", 3, {
    isActive: false,
    position: 1,
  });
  await category("b", "root", "b", "Grupa B", 2, {
    position: 1,
    isActive: false,
  });
  await category("b1", "b", "b1", "List B1", 3);

  await owner.insert(categoryAttributes).values([
    attr(ids.root, {
      key: "weight_kg",
      unit: "kg",
      minValue: "0",
      maxValue: "500",
      position: 0,
      filterable: true,
    }),
    attr(ids.root, { key: "old_flag", position: 1, isActive: false }),
    attr(ids.a, {
      key: "capacity_l",
      unit: "l",
      required: true,
      minValue: "50",
      maxValue: "800",
      position: 0,
      filterable: true,
      sortable: true,
    }),
    attr(ids.a, {
      key: "finish",
      type: "enum",
      options: [
        { value: "matte", label: "Mat" },
        { value: "gloss", label: "Sjaj" },
      ],
      position: 1,
    }),
    attr(ids.a1, { key: "doors", unit: "pcs", position: 0 }),
  ]);
});

afterAll(async () => {
  await owner.execute(
    sql`delete from category_attributes where category_id in (select id from categories where path <@ ${rootPath}::ltree)`,
  );
  await owner.execute(
    sql`delete from categories where path <@ ${rootPath}::ltree and depth = 3`,
  );
  await owner.execute(
    sql`delete from categories where path <@ ${rootPath}::ltree and depth = 2`,
  );
  await owner.execute(
    sql`delete from categories where path = ${rootPath}::ltree`,
  );
  await ownerPool.end();
  await closeDb();
});

describe("listCategoryTree", () => {
  it("a buyer sees the active part: no inactive category and nothing below it", async () => {
    const tree = await as(buyer, (tx) => listCategoryTree(tx, buyer));
    const root = ownRoot(tree)!;
    expect(root.name).toBe("Korijen");
    expect(root.children.map((c) => c.id)).toEqual([ids.a]);
    expect(root.children[0]!.children.map((c) => c.id)).toEqual([ids.a1]);
    const everything = flatIds(root);
    for (const hidden of [ids.a2, ids.b, ids.b1])
      expect(everything).not.toContain(hidden);
  });

  it("the platform sees every category, inactive ones included, in position order", async () => {
    const tree = await as(platform, (tx) => listCategoryTree(tx, platform));
    const root = ownRoot(tree)!;
    expect(root.children.map((c) => c.id)).toEqual([ids.a, ids.b]); // position 0, 1
    expect(flatIds(root).sort()).toEqual(
      [ids.root, ids.a, ids.a1, ids.a2, ids.b, ids.b1].sort(),
    );
  });

  it("marks the leaves: a category with only inactive children is not a leaf", async () => {
    const tree = await as(buyer, (tx) => listCategoryTree(tx, buyer));
    const a = ownRoot(tree)!.children[0]!;
    expect(a.isLeaf).toBe(false);
    expect(a.children[0]!.isLeaf).toBe(true);
  });

  it("a buyer, a supplier and the platform may all read it (matrix: B*, S*, P)", async () => {
    for (const a of [buyer, supplier, platform]) {
      const tree = await as(a, (tx) => listCategoryTree(tx, a));
      expect(ownRoot(tree)).toBeDefined();
    }
  });
});

describe("getCategory", () => {
  it("returns the breadcrumb and the effective attributes: own and inherited, ancestors' first", async () => {
    const detail = await as(buyer, (tx) => getCategory(tx, buyer, ids.a1));
    expect(detail.category).toMatchObject({
      id: ids.a1,
      name: "List A1",
      depth: 3,
      isLeaf: true,
      isActive: true,
    });
    expect(detail.ancestors.map((a) => a.name)).toEqual(["Korijen", "Grupa A"]);
    expect(detail.attributes.map((a) => [a.key, a.inherited])).toEqual([
      ["weight_kg", true], // from the root
      ["capacity_l", true], // from Grupa A
      ["finish", true],
      ["doors", false], // its own
    ]);
  });

  it("gives forms and filters what they need: type, unit, limits, options, flags and the defining category", async () => {
    const { attributes } = await as(buyer, (tx) =>
      getCategory(tx, buyer, ids.a1),
    );
    const capacity = attributes.find((a) => a.key === "capacity_l")!;
    expect(capacity).toMatchObject({
      type: "number",
      unit: "l",
      required: true,
      minValue: "50",
      maxValue: "800",
      filterable: true,
      sortable: true,
      categoryId: ids.a,
    });
    expect(attributes.find((a) => a.key === "finish")!.options).toEqual([
      { value: "matte", label: "Mat" },
      { value: "gloss", label: "Sjaj" },
    ]);
  });

  it("a middle category shows its own and its ancestors' attributes only (not the children's)", async () => {
    const detail = await as(buyer, (tx) => getCategory(tx, buyer, ids.a));
    expect(detail.category.isLeaf).toBe(false);
    expect(detail.attributes.map((a) => a.key)).toEqual([
      "weight_kg",
      "capacity_l",
      "finish",
    ]);
    expect(detail.ancestors.map((a) => a.name)).toEqual(["Korijen"]);
  });

  it("the root has no ancestors", async () => {
    const detail = await as(buyer, (tx) => getCategory(tx, buyer, ids.root));
    expect(detail.ancestors).toEqual([]);
    expect(detail.attributes.map((a) => a.key)).toEqual(["weight_kg"]);
  });

  it("an inactive attribute definition is hidden from buyers and suppliers, shown to the platform", async () => {
    for (const a of [buyer, supplier]) {
      const keys = (
        await as(a, (tx) => getCategory(tx, a, ids.a1))
      ).attributes.map((x) => x.key);
      expect(keys).not.toContain("old_flag");
    }
    const platformKeys = (
      await as(platform, (tx) => getCategory(tx, platform, ids.a1))
    ).attributes.map((x) => x.key);
    expect(platformKeys).toContain("old_flag");
  });

  it("an inactive category, and one under an inactive parent, is NotFound for a buyer — and the platform sees them", async () => {
    for (const id of [ids.a2, ids.b, ids.b1]) {
      expect(
        await as(buyer, (tx) => getCategory(tx, buyer, id)).catch(
          (e: unknown) => e,
        ),
      ).toBeInstanceOf(NotFound);
      expect(
        await as(supplier, (tx) => getCategory(tx, supplier, id)).catch(
          (e: unknown) => e,
        ),
      ).toBeInstanceOf(NotFound);
      const detail = await as(platform, (tx) => getCategory(tx, platform, id));
      expect(detail.category.id).toBe(id);
    }
  });

  it("an unknown id is NotFound", async () => {
    const error = await as(buyer, (tx) =>
      getCategory(tx, buyer, "99999999-9999-4999-8999-999999999999"),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFound);
  });
});

describe("listLeafCategories", () => {
  it("a buyer gets only the active leaves, with a readable path", async () => {
    const leaves = await as(buyer, (tx) => listLeafCategories(tx, buyer));
    const own = leaves.filter((l) => l.path[0] === "Korijen");
    expect(own).toEqual([
      expect.objectContaining({
        id: ids.a1,
        name: "List A1",
        label: "Korijen › Grupa A › List A1",
      }),
    ]);
  });

  it("the platform gets every leaf, inactive ones included", async () => {
    const leaves = await as(platform, (tx) => listLeafCategories(tx, platform));
    const own = leaves.filter((l) => l.path[0] === "Korijen").map((l) => l.id);
    expect(own.sort()).toEqual([ids.a1, ids.a2, ids.b1].sort());
  });
});
