import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  buildCategoryTree,
  listLeaves,
  type CategoryRow,
} from "./category-tree";

const row = (
  id: string,
  parentId: string | null,
  name: string,
  over: Partial<CategoryRow> = {},
): CategoryRow => ({
  id,
  parentId,
  slug: id,
  name,
  depth: parentId === null ? 1 : 2,
  position: 0,
  isActive: true,
  ...over,
});

//  A (pos 1)            B (pos 0)  ← comes first
//    A1 (leaf)            B1 (leaf)
//    A2 (leaf, inactive)  B2 (inactive) → B21 (active leaf, hidden with its parent)
const ROWS: CategoryRow[] = [
  row("A", null, "Alfa", { position: 1 }),
  row("A1", "A", "Zeta"),
  row("A2", "A", "Eta", { isActive: false }),
  row("B", null, "Beta", { position: 0 }),
  row("B1", "B", "Teta"),
  row("B2", "B", "Jota", { isActive: false }),
  row("B21", "B2", "Kapa", { depth: 3 }),
];

const shape = (nodes: ReturnType<typeof buildCategoryTree>): unknown =>
  nodes.map((n) => (n.children.length ? [n.id, shape(n.children)] : n.id));

describe("buildCategoryTree", () => {
  it("orders siblings by position, then by name", () => {
    const tree = buildCategoryTree(ROWS, { includeInactive: true });
    expect(tree.map((n) => n.id)).toEqual(["B", "A"]); // position 0 before 1
    const a = tree.find((n) => n.id === "A")!;
    expect(a.children.map((n) => n.id)).toEqual(["A2", "A1"]); // Eta before Zeta
  });

  it("breaks position ties with the Montenegrin alphabet (č after c, ž after z)", () => {
    const tree = buildCategoryTree(
      [
        row("1", null, "Žitarice"),
        row("2", null, "Čaše"),
        row("3", null, "Cvijeće"),
        row("4", null, "Začini"),
      ],
      { includeInactive: true },
    );
    expect(tree.map((n) => n.name)).toEqual([
      "Cvijeće",
      "Čaše",
      "Začini",
      "Žitarice",
    ]);
  });

  it("without includeInactive an inactive category disappears together with its whole subtree", () => {
    const tree = buildCategoryTree(ROWS, { includeInactive: false });
    expect(shape(tree)).toEqual([
      ["B", ["B1"]],
      ["A", ["A1"]],
    ]);
    // B21 is active itself but sits under the inactive B2: gone.
    expect(JSON.stringify(tree)).not.toContain("B21");
  });

  it("with includeInactive (the platform) everything is there", () => {
    const tree = buildCategoryTree(ROWS, { includeInactive: true });
    expect(JSON.stringify(tree)).toContain("B21");
    expect(shape(tree)).toEqual([
      ["B", [["B2", ["B21"]], "B1"]], // Jota (B2) comes before Teta (B1)
      ["A", ["A2", "A1"]],
    ]);
  });

  it("isLeaf means 'no sub-category at all' — also when every child is inactive", () => {
    const rows = [
      row("P", null, "Roditelj"),
      row("C", "P", "Dijete", { isActive: false }),
    ];
    const [p] = buildCategoryTree(rows, { includeInactive: false });
    expect(p!.children).toEqual([]); // the inactive child is hidden …
    expect(p!.isLeaf).toBe(false); // … but P is still not a leaf: nothing may be put on it
  });

  it("does not change its input", () => {
    const copy = structuredClone(ROWS);
    buildCategoryTree(ROWS, { includeInactive: false });
    expect(ROWS).toEqual(copy);
  });

  it("an empty table is an empty tree; a row whose parent is missing is left out, not an error", () => {
    expect(buildCategoryTree([], { includeInactive: true })).toEqual([]);
    expect(
      buildCategoryTree([row("X", "missing", "Siroče")], {
        includeInactive: true,
      }),
    ).toEqual([]);
  });
});

describe("listLeaves", () => {
  it("lists the leaves in tree order with a readable path", () => {
    const leaves = listLeaves(
      buildCategoryTree(ROWS, { includeInactive: false }),
    );
    expect(leaves.map((l) => l.label)).toEqual(["Beta › Teta", "Alfa › Zeta"]);
    expect(leaves[0]).toMatchObject({
      id: "B1",
      path: ["Beta", "Teta"],
      name: "Teta",
    });
  });

  it("a hidden leaf is not offered; a category whose children are all inactive is not offered either", () => {
    const rows = [
      row("P", null, "Roditelj"),
      row("C", "P", "Dijete", { isActive: false }),
      row("L", null, "List"),
    ];
    const leaves = listLeaves(
      buildCategoryTree(rows, { includeInactive: false }),
    );
    expect(leaves.map((l) => l.id)).toEqual(["L"]);
  });
});

describe("ancestorsOf", () => {
  it("returns the chain root first, without the category itself", () => {
    expect(ancestorsOf(ROWS, "B21")!.map((r) => r.id)).toEqual(["B", "B2"]);
    expect(ancestorsOf(ROWS, "A")).toEqual([]);
  });

  it("is null for an unknown category or a broken chain", () => {
    expect(ancestorsOf(ROWS, "nope")).toBeNull();
    expect(ancestorsOf([row("X", "missing", "Siroče")], "X")).toBeNull();
  });
});
