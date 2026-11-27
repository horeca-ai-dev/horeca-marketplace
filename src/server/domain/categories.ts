/**
 * Category services (D5-B2; matrix: category.view): the tree, one category with its breadcrumb and EFFECTIVE
 * attributes, and the leaf categories a product may be put on. Read-only — the admin edits categories in D14.
 *
 * Effective attributes = the category's own attribute definitions plus those of every ancestor (decision 10:
 * inheritance down the tree, no overrides). The product services validate attribute values against exactly
 * this set (`loadAttributeDefinitions`), and the forms and the search filters (D6, D7) are drawn from it.
 *
 * Visibility: every logged-in organization reads categories (RLS says the same). An INACTIVE category — and
 * with it its whole subtree — and an inactive attribute definition are visible to the platform only; for
 * everybody else they simply do not exist (NotFound for a category).
 */
import { asc, eq, sql } from "drizzle-orm";
import { warnIfEmptyRead } from "@/server/db/rls-debug";
import { categories, categoryAttributes } from "@/server/db/schema";
import type { Tx } from "@/server/db/tx";
import { getLogger } from "@/server/logger";
import type { Actor } from "./actor";
import type { AttributeDefinition } from "./attributes";
import {
  ancestorsOf,
  buildCategoryTree,
  listLeaves,
  type CategoryNode,
  type CategoryRow,
  type LeafCategory,
} from "./category-tree";
import { NotFound } from "./errors";
import { assertCan } from "./policy";

const log = getLogger("categories");

/** An attribute definition as the forms and filters need it, with the category it was defined on. */
export type EffectiveAttribute = AttributeDefinition & {
  id: string;
  /** The category that defines it (an ancestor, or the category itself). */
  categoryId: string;
  position: number;
  filterable: boolean;
  sortable: boolean;
};

export type CategoryDetail = {
  category: Pick<
    CategoryNode,
    "id" | "slug" | "name" | "depth" | "isActive" | "isLeaf"
  >;
  /** Root first, the category itself not included. */
  ancestors: { id: string; slug: string; name: string }[];
  /** Own and inherited, ancestors' first; `inherited` is true for the ones defined above this category. */
  attributes: (EffectiveAttribute & { inherited: boolean })[];
};

/** Attribute definitions of the category AND its ancestors (ltree: `a @> b` = a is b or an ancestor of b). */
export async function loadAttributeDefinitions(
  tx: Tx,
  categoryId: string,
): Promise<EffectiveAttribute[]> {
  return tx
    .select({
      id: categoryAttributes.id,
      categoryId: categoryAttributes.categoryId,
      key: categoryAttributes.key,
      label: categoryAttributes.label,
      type: categoryAttributes.type,
      unit: categoryAttributes.unit,
      required: categoryAttributes.required,
      options: categoryAttributes.options,
      minValue: categoryAttributes.minValue,
      maxValue: categoryAttributes.maxValue,
      isActive: categoryAttributes.isActive,
      position: categoryAttributes.position,
      filterable: categoryAttributes.filterable,
      sortable: categoryAttributes.sortable,
    })
    .from(categoryAttributes)
    .innerJoin(categories, eq(categories.id, categoryAttributes.categoryId))
    .where(
      sql`${categories.path} @> (select c.path from categories c where c.id = ${categoryId})`,
    )
    .orderBy(asc(categories.depth), asc(categoryAttributes.position));
}

/** All categories, flat, parents before children. The table is tiny (≤ 3 levels). */
async function loadCategoryRows(tx: Tx): Promise<CategoryRow[]> {
  return tx
    .select({
      id: categories.id,
      parentId: categories.parentId,
      slug: categories.slug,
      name: categories.name,
      depth: categories.depth,
      position: categories.position,
      isActive: categories.isActive,
    })
    .from(categories)
    .orderBy(asc(categories.depth), asc(categories.position));
}

const seesInactive = (actor: Actor) => actor.orgType === "platform";

/** The whole category tree, siblings in their order; the platform also gets the inactive ones. */
export async function listCategoryTree(
  tx: Tx,
  actor: Actor,
): Promise<CategoryNode[]> {
  assertCan(actor, "category.view");
  const rows = warnIfEmptyRead(
    log,
    actor,
    "category.tree",
    await loadCategoryRows(tx),
  );
  return buildCategoryTree(rows, { includeInactive: seesInactive(actor) });
}

/** Every category a product may be put on (leaves), with a readable path — for the category picker. */
export async function listLeafCategories(
  tx: Tx,
  actor: Actor,
): Promise<LeafCategory[]> {
  return listLeaves(await listCategoryTree(tx, actor));
}

/**
 * One category with its breadcrumb and effective attributes. A category that is inactive, or sits under an
 * inactive one, is NotFound for everybody but the platform.
 */
export async function getCategory(
  tx: Tx,
  actor: Actor,
  categoryId: string,
): Promise<CategoryDetail> {
  assertCan(actor, "category.view");
  const rows = await loadCategoryRows(tx);
  const category = rows.find((row) => row.id === categoryId);
  const ancestors = category ? ancestorsOf(rows, categoryId) : null;
  if (!category || !ancestors) throw new NotFound();
  const visible =
    seesInactive(actor) ||
    (category.isActive && ancestors.every((a) => a.isActive));
  if (!visible) throw new NotFound();

  const attributes = (await loadAttributeDefinitions(tx, categoryId))
    .filter((attribute) => seesInactive(actor) || attribute.isActive)
    .map((attribute) => ({
      ...attribute,
      inherited: attribute.categoryId !== categoryId,
    }));

  return {
    category: {
      id: category.id,
      slug: category.slug,
      name: category.name,
      depth: category.depth,
      isActive: category.isActive,
      isLeaf: !rows.some((row) => row.parentId === category.id),
    },
    ancestors: ancestors.map(({ id, slug, name }) => ({ id, slug, name })),
    attributes,
  };
}
