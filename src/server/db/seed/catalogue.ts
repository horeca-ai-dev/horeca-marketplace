/**
 * Seeds the category tree and the attribute definitions (D3-B2). The seed entry point (D3-B1) calls it.
 *
 * Runs as `horeca_owner` (reference data is not created by a user — APPLIED.md "D3-B1 · seed"). It only
 * **adds what is missing and never overwrites**: running it again changes nothing, and a name the admin
 * edited later survives a re-seed. Takes a transaction handle, like every function that touches data.
 */
import { and, eq, sql } from "drizzle-orm";
import { categories, categoryAttributes } from "../schema";
import type { Tx } from "../tx";
import { flattenCategories } from "./catalogue-data";

export type CatalogueSeedResult = {
  categoriesInserted: number;
  attributesInserted: number;
};

export async function seedCatalogue(tx: Tx): Promise<CatalogueSeedResult> {
  const idByPath = new Map<string, string>();
  let categoriesInserted = 0;
  let attributesInserted = 0;

  for (const c of flattenCategories()) {
    const parentId = c.parentPath ? idByPath.get(c.parentPath) : null;
    if (c.parentPath && !parentId) {
      throw new Error(`Seed order broken: parent of ${c.path} not inserted`);
    }

    const inserted = await tx
      .insert(categories)
      .values({
        parentId: parentId ?? null,
        path: c.path,
        slug: c.slug,
        name: c.name,
        depth: c.depth,
        position: c.position,
      })
      .onConflictDoNothing()
      .returning({ id: categories.id });
    categoriesInserted += inserted.length;

    // Existing or new — either way we need its id for the children and the attributes.
    const [row] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(sql`${categories.path} = ${c.path}::ltree`);
    if (!row) throw new Error(`Category ${c.path} missing after insert`);
    idByPath.set(c.path, row.id);

    for (const [index, a] of c.attributes.entries()) {
      const [existing] = await tx
        .select({ id: categoryAttributes.id })
        .from(categoryAttributes)
        .where(
          and(
            eq(categoryAttributes.categoryId, row.id),
            eq(categoryAttributes.key, a.key),
          ),
        );
      if (existing) continue;
      await tx.insert(categoryAttributes).values({
        categoryId: row.id,
        key: a.key,
        label: a.label,
        type: a.type,
        unit: a.unit ?? null,
        required: a.required,
        filterable: a.filterable,
        sortable: a.sortable,
        options: a.options ?? null,
        minValue: a.min === undefined ? null : String(a.min),
        maxValue: a.max === undefined ? null : String(a.max),
        position: index,
      });
      attributesInserted += 1;
    }
  }

  return { categoriesInserted, attributesInserted };
}
