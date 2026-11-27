/**
 * Product input — the contract between the product forms (D6) / CSV import (D6-B2) and the product
 * services (D5-B3a, `src/server/domain/products.ts`).
 *
 * Shared by UI and server (CLAUDE.md rule 13); the domain validates again with the same schemas. Unknown
 * keys are rejected (`z.strictObject`), so a request can never set a column we did not name. Money is an
 * integer number of cents (rule 7); the form converts "489,00" to 48900.
 *
 * What a schema cannot know is checked in the service, against the database: the category is an active
 * leaf, the VAT rate is one of `settings.vat_rates_bps`, and `attributes` match the category's attribute
 * definitions.
 */
import { z } from "zod";

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatusValue = (typeof PRODUCT_STATUSES)[number];

/** Same values as the `product_unit` enum (a test keeps the two in step). */
export const PRODUCT_UNITS = ["piece", "box", "pack", "kg", "l", "m"] as const;

/** What a supplier may do to a product's status; `productTransition()` decides which are legal. */
export const PRODUCT_EVENTS = [
  "activate",
  "deactivate",
  "archive",
  "restore",
] as const;
export type ProductEvent = (typeof PRODUCT_EVENTS)[number];

/** Letters, digits and . _ - / only (no spaces): the SKU is the supplier's key for CSV upserts. Verify with D6-B2. */
export const skuSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/,
    "SKU: 1–64 characters, letters, digits and . _ - / only.",
  );

const text = (max: number) => z.string().trim().min(1).max(max);

/** Optional text: empty, null and missing all become `null`. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** GTIN / EAN: 8, 12, 13 or 14 digits (the database CHECK says the same). */
const gtinSchema = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .pipe(
    z
      .string()
      .regex(/^(\d{8}|\d{12,14})$/, "GTIN must have 8, 12, 13 or 14 digits.")
      .nullable(),
  );

const attributeValues = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);

/** Everything a supplier edits on an existing product. The SKU is not here: it never changes after creation. */
const editableShape = {
  categoryId: z.uuid(),
  name: text(200),
  description: optionalText(5000),
  brand: optionalText(100),
  gtin: gtinSchema,
  mpn: optionalText(100),
  unit: z.enum(PRODUCT_UNITS),
  minOrderQty: z.number().int().min(1).max(100_000),
  orderStep: z.number().int().min(1).max(100_000),
  /** Net unit price in cents. */
  basePriceCents: z.number().int().min(1).max(100_000_000),
  /** Basis points (2100 = 21 %); the service checks it against `settings.vat_rates_bps`. */
  vatRateBps: z.number().int().min(0).max(10_000),
  attributes: attributeValues.default({}),
};

// Same rule as the database CHECK `products_qty_rules`: the minimum is a multiple of the step.
const isMultipleOfStep = (v: { minOrderQty: number; orderStep: number }) =>
  v.minOrderQty % v.orderStep === 0;
const quantityIssue = {
  path: ["minOrderQty"],
  error: "The minimum quantity must be a multiple of the order step.",
};

export const updateProductSchema = z
  .strictObject(editableShape)
  .refine(isMultipleOfStep, quantityIssue);
export const createProductSchema = z
  .strictObject({ sku: skuSchema, ...editableShape })
  .refine(isMultipleOfStep, quantityIssue);

export const setProductStatusSchema = z.strictObject({
  productId: z.uuid(),
  event: z.enum(PRODUCT_EVENTS),
});

export const listProductsSchema = z.strictObject({
  status: z.enum(PRODUCT_STATUSES).optional(),
  /** Matches the SKU or the name (case-insensitive, anywhere in the text). */
  q: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export type CreateProductInput = z.input<typeof createProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type SetProductStatusInput = z.input<typeof setProductStatusSchema>;
export type ListProductsInput = z.input<typeof listProductsSchema>;
