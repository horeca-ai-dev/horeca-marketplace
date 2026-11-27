/**
 * Product services (D5-B3a; matrix: product.create / .update / .setStatus / .list / .view).
 *
 * A supplier's own listings. Every function is `(tx, actor, input)` and runs inside the caller's transaction
 * (withTx(actor)), so Postgres RLS is the second line behind `policy.assertCan` and the explicit
 * `supplier_org_id = actor.orgId` filters below. Checked here, because neither the Zod schema nor RLS can:
 *   - the supplier is not suspended (409; RLS would only answer "0 rows")
 *   - the category is an active LEAF (products live on leaf categories only)
 *   - the VAT rate is one of `settings.vat_rates_bps`
 *   - `attributes` match the category's attribute definitions, inherited down the tree (generated Zod schema)
 *   - a product is complete (all required attributes) before it may be `active`
 *
 * Decisions (APPLIED.md · D5-B3a): the SKU never changes after creation (it is the key of the CSV upsert and
 * is copied into order lines); an archived product cannot be edited, only restored to `draft`; an update
 * replaces all editable fields; attribute values of a definition the admin has since deactivated are kept.
 *
 * Not here: the Meilisearch sync (a job enqueued in this same transaction — D7-B3 adds it to create, update
 * and setStatus), Server Actions, screens, image upload (D6-B0).
 */
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  createProductSchema,
  listProductsSchema,
  setProductStatusSchema,
  updateProductSchema,
  type CreateProductInput,
  type ListProductsInput,
  type SetProductStatusInput,
  type UpdateProductInput,
} from "@/lib/schemas/product";
import { warnIfEmptyRead } from "@/server/db/rls-debug";
import {
  categories,
  categoryAttributes,
  orgProfiles,
  products,
  settings,
} from "@/server/db/schema";
import type { Tx } from "@/server/db/tx";
import { getLogger } from "@/server/logger";
import type { Actor } from "./actor";
import {
  attributeValuesSchema,
  type AttributeDefinition,
  type AttributeValues,
} from "./attributes";
import { Conflict, NotFound, Validation } from "./errors";
import { assertCan } from "./policy";
import { transitionProduct } from "./product-status";
import { fieldErrorsFromZod, parseInput } from "./validation";

const log = getLogger("products");

export type ProductRecord = typeof products.$inferSelect;

export type ProductPage = {
  items: ProductRecord[];
  total: number;
  page: number;
  pageSize: number;
};

const SKU_UNIQUE = "products_supplier_sku_uq";

// ───────────────────────── checks ─────────────────────────

/** A suspended supplier keeps its orders but cannot touch the catalogue (matrix: "supplier not suspended"). */
async function assertSupplierNotSuspended(tx: Tx, actor: Actor) {
  const [profile] = await tx
    .select({ status: orgProfiles.status })
    .from(orgProfiles)
    .where(eq(orgProfiles.organizationId, actor.orgId));
  if (!profile) throw new NotFound();
  if (profile.status === "suspended") {
    throw new Conflict(
      "Your company is suspended, so the catalogue cannot be changed.",
    );
  }
}

/** The category must exist, be active and have no children. */
async function assertActiveLeafCategory(tx: Tx, categoryId: string) {
  const [category] = await tx
    .select({ isActive: categories.isActive })
    .from(categories)
    .where(eq(categories.id, categoryId));
  if (!category?.isActive) {
    throw new Validation(undefined, {
      categoryId: ["Choose an existing, active category."],
    });
  }
  const [child] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, categoryId))
    .limit(1);
  if (child) {
    throw new Validation(undefined, {
      categoryId: [
        "Choose the most specific category (one without sub-categories).",
      ],
    });
  }
}

async function assertVatRateAllowed(tx: Tx, vatRateBps: number) {
  const [row] = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "vat_rates_bps"));
  const rates = z.array(z.number().int()).safeParse(row?.value);
  if (!rates.success)
    throw new Error("settings.vat_rates_bps is missing or invalid");
  if (!rates.data.includes(vatRateBps)) {
    throw new Validation(undefined, {
      vatRateBps: [
        `Choose one of the VAT rates: ${rates.data.join(", ")} (basis points).`,
      ],
    });
  }
}

/** Attribute definitions of the category AND its ancestors (ltree: `a @> b` = a is b or an ancestor of b). */
async function loadAttributeDefinitions(
  tx: Tx,
  categoryId: string,
): Promise<AttributeDefinition[]> {
  return tx
    .select({
      key: categoryAttributes.key,
      label: categoryAttributes.label,
      type: categoryAttributes.type,
      unit: categoryAttributes.unit,
      required: categoryAttributes.required,
      options: categoryAttributes.options,
      minValue: categoryAttributes.minValue,
      maxValue: categoryAttributes.maxValue,
      isActive: categoryAttributes.isActive,
    })
    .from(categoryAttributes)
    .innerJoin(categories, eq(categories.id, categoryAttributes.categoryId))
    .where(
      sql`${categories.path} @> (select c.path from categories c where c.id = ${categoryId})`,
    )
    .orderBy(asc(categories.depth), asc(categoryAttributes.position));
}

/**
 * Validates attribute values against the definitions. Values of definitions that are no longer active are
 * not accepted from the caller but `kept` as they were (existing data survives a deactivation).
 */
function validateAttributes(
  definitions: AttributeDefinition[],
  input: AttributeValues,
  options: { complete: boolean; existing?: AttributeValues },
): AttributeValues {
  const result = attributeValuesSchema(definitions, {
    complete: options.complete,
  }).safeParse(input);
  if (!result.success) {
    const errors = fieldErrorsFromZod(result.error);
    throw new Validation(
      undefined,
      Object.fromEntries(
        Object.entries(errors).map(([path, messages]) => [
          `attributes.${path}`,
          messages,
        ]),
      ),
    );
  }
  const kept: AttributeValues = {};
  for (const def of definitions) {
    const old = options.existing?.[def.key];
    if (!def.isActive && old !== undefined) kept[def.key] = old;
  }
  // Drop `undefined` (optional attributes left out) — JSONB has no undefined.
  const given = Object.fromEntries(
    Object.entries(result.data).filter(([, v]) => v !== undefined),
  ) as AttributeValues;
  return { ...kept, ...given };
}

/** The supplier's own product; anything else (another supplier's, missing) is NotFound — never reveal it exists. */
async function loadOwnProduct(
  tx: Tx,
  actor: Actor,
  productId: string,
): Promise<ProductRecord> {
  const [product] = await tx
    .select()
    .from(products)
    .where(
      and(eq(products.id, productId), eq(products.supplierOrgId, actor.orgId)),
    );
  if (!product) throw new NotFound();
  return product;
}

// ───────────────────────── services ─────────────────────────

/** Creates a product as a `draft` (activating it is a separate step, once it is complete). */
export async function createProduct(
  tx: Tx,
  actor: Actor,
  rawInput: CreateProductInput,
): Promise<ProductRecord> {
  assertCan(actor, "product.create");
  const input = parseInput(createProductSchema, rawInput);
  await assertSupplierNotSuspended(tx, actor);
  await assertActiveLeafCategory(tx, input.categoryId);
  await assertVatRateAllowed(tx, input.vatRateBps);
  const definitions = await loadAttributeDefinitions(tx, input.categoryId);
  const attributes = validateAttributes(definitions, input.attributes, {
    complete: false,
  });

  try {
    // Every column named explicitly — never spread input into an insert (rule 13).
    const [created] = await tx
      .insert(products)
      .values({
        supplierOrgId: actor.orgId,
        categoryId: input.categoryId,
        sku: input.sku,
        name: input.name,
        description: input.description,
        brand: input.brand,
        gtin: input.gtin,
        mpn: input.mpn,
        unit: input.unit,
        minOrderQty: input.minOrderQty,
        orderStep: input.orderStep,
        basePriceCents: input.basePriceCents,
        vatRateBps: input.vatRateBps,
        status: "draft",
        attributes,
      })
      .returning();
    return created!;
  } catch (error) {
    if (isUniqueViolation(error, SKU_UNIQUE)) {
      throw new Conflict("You already have a product with this SKU.", {
        reason: "SKU_TAKEN",
      });
    }
    throw error;
  }
}

/** Replaces all editable fields of an own, non-archived product. The SKU and the status do not change here. */
export async function updateProduct(
  tx: Tx,
  actor: Actor,
  productId: string,
  rawInput: UpdateProductInput,
): Promise<ProductRecord> {
  assertCan(actor, "product.update");
  const input = parseInput(updateProductSchema, rawInput);
  await assertSupplierNotSuspended(tx, actor);
  const product = await loadOwnProduct(tx, actor, productId);
  assertCan(actor, "product.update", { orgId: product.supplierOrgId });
  if (product.status === "archived") {
    throw new Conflict(
      "An archived product cannot be edited. Restore it first.",
    );
  }

  await assertActiveLeafCategory(tx, input.categoryId);
  await assertVatRateAllowed(tx, input.vatRateBps);
  const definitions = await loadAttributeDefinitions(tx, input.categoryId);
  // A live product must stay complete: buyers see it.
  const attributes = validateAttributes(definitions, input.attributes, {
    complete: product.status === "active",
    existing: product.attributes,
  });

  const [updated] = await tx
    .update(products)
    .set({
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      brand: input.brand,
      gtin: input.gtin,
      mpn: input.mpn,
      unit: input.unit,
      minOrderQty: input.minOrderQty,
      orderStep: input.orderStep,
      basePriceCents: input.basePriceCents,
      vatRateBps: input.vatRateBps,
      attributes,
      updatedAt: new Date(),
    })
    .where(
      and(eq(products.id, product.id), eq(products.supplierOrgId, actor.orgId)),
    )
    .returning();
  if (!updated) throw new NotFound();
  return updated;
}

/** activate / deactivate / archive / restore — the legal changes are in `transitionProduct`. */
export async function setProductStatus(
  tx: Tx,
  actor: Actor,
  rawInput: SetProductStatusInput,
): Promise<ProductRecord> {
  assertCan(actor, "product.setStatus");
  const input = parseInput(setProductStatusSchema, rawInput);
  await assertSupplierNotSuspended(tx, actor);
  const product = await loadOwnProduct(tx, actor, input.productId);
  assertCan(actor, "product.setStatus", { orgId: product.supplierOrgId });

  const next = transitionProduct(product.status, input.event);

  if (next === "active") {
    // Going live: the category must still be a valid leaf and every required attribute present.
    await assertActiveLeafCategory(tx, product.categoryId);
    const definitions = await loadAttributeDefinitions(tx, product.categoryId);
    validateAttributes(definitions, product.attributes, {
      complete: true,
      existing: product.attributes,
    });
  }

  const [updated] = await tx
    .update(products)
    .set({ status: next, updatedAt: new Date() })
    .where(
      and(eq(products.id, product.id), eq(products.supplierOrgId, actor.orgId)),
    )
    .returning();
  if (!updated) throw new NotFound();
  return updated;
}

/**
 * One product, as far as RLS lets this actor see it: own products in any status, other suppliers' only when
 * active and approved. Anything else is NotFound.
 */
export async function getProduct(
  tx: Tx,
  actor: Actor,
  productId: string,
): Promise<ProductRecord> {
  assertCan(actor, "product.view");
  const rows = warnIfEmptyRead(
    log,
    actor,
    "products.get",
    await tx.select().from(products).where(eq(products.id, productId)),
  );
  const [product] = rows;
  if (!product) throw new NotFound();
  return product;
}

/** The supplier dashboard list: own products only, newest change first. Reads Postgres, never Meilisearch (rule 12). */
export async function listProducts(
  tx: Tx,
  actor: Actor,
  rawInput: ListProductsInput = {},
): Promise<ProductPage> {
  assertCan(actor, "product.list");
  const input = parseInput(listProductsSchema, rawInput);

  const pattern = input.q ? `%${escapeLike(input.q)}%` : undefined;
  const where = and(
    eq(products.supplierOrgId, actor.orgId),
    input.status ? eq(products.status, input.status) : undefined,
    pattern
      ? or(ilike(products.sku, pattern), ilike(products.name, pattern))
      : undefined,
  );

  const [totalRow] = await tx
    .select({ total: count() })
    .from(products)
    .where(where);
  const items = warnIfEmptyRead(
    log,
    actor,
    "products.list",
    await tx
      .select()
      .from(products)
      .where(where)
      .orderBy(desc(products.updatedAt), asc(products.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
  );
  return {
    items: [...items],
    total: totalRow?.total ?? 0,
    page: input.page,
    pageSize: input.pageSize,
  };
}

// ───────────────────────── helpers ─────────────────────────

/** `%`, `_` and `\` are wildcards / the escape character in LIKE: a search for "50%" must mean 50%. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Postgres unique_violation (23505) on the given constraint; Drizzle wraps the driver error in `cause`. */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = (
    error as { cause?: { code?: string; constraint?: string } } | null
  )?.cause;
  return cause?.code === "23505" && cause.constraint === constraint;
}
