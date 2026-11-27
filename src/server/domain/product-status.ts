/**
 * The product status machine (D5-B3a, CLAUDE.md rule 10): one function decides every status change.
 *
 *   draft ──activate──▶ active ──deactivate──▶ draft
 *     │                   │
 *     └───────archive─────┴──▶ archived ──restore──▶ draft
 *
 * `archived` is never left straight to `active`: a restored product comes back as a draft, so the supplier
 * looks at it once more (and its attributes are re-checked) before buyers can see it again.
 *
 * Pure: it knows nothing about who may do it (policy.can) or whether the attributes are complete (the
 * service checks that when activating). An illegal change is a `Conflict` (409).
 */
import type { ProductEvent, ProductStatusValue } from "@/lib/schemas/product";
import { Conflict } from "./errors";

const NEXT: Record<
  ProductStatusValue,
  Partial<Record<ProductEvent, ProductStatusValue>>
> = {
  draft: { activate: "active", archive: "archived" },
  active: { deactivate: "draft", archive: "archived" },
  archived: { restore: "draft" },
};

const DONE: Record<ProductEvent, string> = {
  activate: "activated",
  deactivate: "moved back to draft",
  archive: "archived",
  restore: "restored",
};

export function transitionProduct(
  from: ProductStatusValue,
  event: ProductEvent,
): ProductStatusValue {
  const to = NEXT[from][event];
  if (!to) {
    throw new Conflict(`A ${from} product cannot be ${DONE[event]}.`);
  }
  return to;
}
