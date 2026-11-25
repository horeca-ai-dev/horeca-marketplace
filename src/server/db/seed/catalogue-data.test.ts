/** The seed data obeys the catalogue rules (decision 10) — no database needed. */
import { describe, expect, it } from "vitest";
import { CATEGORY_TREE, flattenCategories } from "./catalogue-data";

const flat = flattenCategories(CATEGORY_TREE);
const leaves = flat.filter((c) => c.isLeaf);

/** Attributes a category really has = its own + all its ancestors' (decision 10.2: inheritance). */
function effectiveKeys(path: string): string[] {
  const keys: string[] = [];
  const parts = path.split(".");
  for (let i = 1; i <= parts.length; i++) {
    const p = parts.slice(0, i).join(".");
    keys.push(...flat.find((c) => c.path === p)!.attributes.map((a) => a.key));
  }
  return keys;
}

describe("catalogue seed data", () => {
  it("has 6 roots, 17 leaves and 46 attribute definitions", () => {
    expect(flat.filter((c) => c.depth === 1)).toHaveLength(6);
    expect(leaves).toHaveLength(17);
    expect(flat.flatMap((c) => c.attributes)).toHaveLength(46);
  });

  it("is at most 3 levels deep, and the deepest branch exists", () => {
    expect(Math.max(...flat.map((c) => c.depth))).toBe(3);
    expect(flat.filter((c) => c.depth === 3).map((c) => c.path)).toEqual([
      "kitchen_equipment.cooking.combi_ovens",
      "kitchen_equipment.cooking.ranges",
    ]);
  });

  it("lists parents before children and has unique paths and slugs", () => {
    const seen = new Set<string>();
    for (const c of flat) {
      if (c.parentPath) expect(seen.has(c.parentPath)).toBe(true);
      seen.add(c.path);
    }
    expect(seen.size).toBe(flat.length);
    expect(new Set(flat.map((c) => c.slug)).size).toBe(flat.length);
  });

  it("keeps every attribute key unique along one path (no overrides)", () => {
    for (const leaf of leaves) {
      const keys = effectiveKeys(leaf.path);
      expect(new Set(keys).size, leaf.path).toBe(keys.length);
    }
  });

  it("matches the database constraints on attribute definitions", () => {
    for (const a of flat.flatMap((c) => c.attributes)) {
      expect(a.key, a.key).toMatch(/^[a-z][a-z0-9_]{1,40}$/);
      if (a.type === "enum") {
        expect(a.options?.length, a.key).toBeGreaterThan(0);
        expect(new Set(a.options!.map((o) => o.value)).size).toBe(
          a.options!.length,
        );
      } else {
        expect(a.options, a.key).toBeUndefined();
      }
      if (a.type === "number") {
        expect(a.unit, a.key).toBeTruthy();
        expect(a.min! < a.max!, a.key).toBe(true);
      } else {
        expect(a.min, a.key).toBeUndefined();
        expect(a.max, a.key).toBeUndefined();
      }
      if (a.sortable) expect(a.type, a.key).toBe("number");
    }
  });

  it("names every category and attribute in Montenegrin (no English left)", () => {
    // Spot checks of the translation, including diacritics (decision 012 §10).
    const byPath = new Map(flat.map((c) => [c.path, c.name]));
    expect(byPath.get("refrigeration.under_counter")).toBe(
      "Podpultni frižideri",
    );
    expect(byPath.get("tableware.glasses")).toBe("Čaše");
    expect(byPath.get("textiles.tablecloths")).toBe("Stolnjaci");
    const english = /\b(Kitchen|Refrigeration|Tableware|Textiles|Detergents)\b/;
    for (const c of flat) expect(c.name).not.toMatch(english);
  });
});
