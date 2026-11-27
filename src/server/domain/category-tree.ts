/**
 * The category tree as plain data (D5-B2) — no database, no actor, unit-tested on its own.
 *
 * The categories table is small (a few dozen rows, at most 3 levels), so the services read all of it in one
 * query and build the tree here.
 *
 * Rules (decision 10):
 *   - siblings are ordered by `position`, then by name
 *   - `isLeaf` = the category has NO sub-category at all, active or not: products live on leaf categories,
 *     and a category whose children are all inactive is still not a leaf
 *   - an inactive category hides its whole subtree from everybody but the platform (`includeInactive`)
 */

export type CategoryRow = {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  depth: number;
  position: number;
  isActive: boolean;
};

export type CategoryNode = CategoryRow & {
  isLeaf: boolean;
  children: CategoryNode[];
};

/** A leaf as a picker needs it: the id to save and a readable path ("Rashladna oprema › Zamrzivači"). */
export type LeafCategory = {
  id: string;
  slug: string;
  name: string;
  /** Names from the root down to this category. */
  path: string[];
  label: string;
};

const compare = (a: CategoryRow, b: CategoryRow) =>
  a.position - b.position || a.name.localeCompare(b.name, "sr-Latn-ME");

export function buildCategoryTree(
  rows: readonly CategoryRow[],
  options: { includeInactive: boolean },
): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>(
    rows.map((row) => [row.id, { ...row, isLeaf: true, children: [] }]),
  );
  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId === null) {
      roots.push(node);
      continue;
    }
    const parent = nodes.get(node.parentId);
    // A parent that is not in the data cannot happen (foreign key); such a row is simply unreachable.
    if (!parent) continue;
    parent.children.push(node);
    parent.isLeaf = false;
  }

  const finish = (list: CategoryNode[]): CategoryNode[] =>
    list
      .filter((node) => options.includeInactive || node.isActive)
      .sort(compare)
      .map((node) => ({ ...node, children: finish(node.children) }));
  return finish(roots);
}

/** Every leaf of a (possibly pruned) tree, in tree order. */
export function listLeaves(tree: readonly CategoryNode[]): LeafCategory[] {
  const out: LeafCategory[] = [];
  const walk = (nodes: readonly CategoryNode[], trail: string[]) => {
    for (const node of nodes) {
      const path = [...trail, node.name];
      if (node.isLeaf) {
        out.push({
          id: node.id,
          slug: node.slug,
          name: node.name,
          path,
          label: path.join(" › "),
        });
      } else {
        walk(node.children, path);
      }
    }
  };
  walk(tree, []);
  return out;
}

/** The ancestors of a category, root first, from the flat rows; `null` when the chain is broken. */
export function ancestorsOf(
  rows: readonly CategoryRow[],
  categoryId: string,
): CategoryRow[] | null {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chain: CategoryRow[] = [];
  let current = byId.get(categoryId);
  if (!current) return null;
  while (current.parentId !== null) {
    const parent = byId.get(current.parentId);
    if (!parent) return null;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}
