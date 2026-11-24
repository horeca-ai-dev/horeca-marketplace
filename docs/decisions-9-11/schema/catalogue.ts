/**
 * Catalogue — decision 10.
 *
 * Model: supplier-owned listings (no shared master catalogue); category tree with typed attribute
 * definitions inherited down the tree; attribute VALUES stored as JSONB on the product and validated by a
 * Zod schema generated from the definitions (unknown keys rejected). Search runs in Meilisearch; Postgres
 * only serves supplier/admin dashboards, product detail and re-fetch by ID.
 *
 * Owner org type · RLS (see rls.sql):
 *   categories, category_attributes  platform (reference data) · read: any logged-in org; write: platform
 *   products                         supplier                  · own rows; others read active rows of approved suppliers
 *   product_images                   supplier                  · same visibility as the product
 *   csv_imports                      supplier                  · own rows; platform read
 */
import { sql } from "drizzle-orm";
import {
  boolean, check, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, smallint, text,
  timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./better-auth.placeholder";
import { cents, ltree } from "./_shared";


// ───────────────────────── categories ─────────────────────────

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL = root. Kept next to `path` for FK integrity and simple "children of" queries. */
    parentId: uuid("parent_id"),
    /** e.g. `refrigeration.under_counter`. Maintained by the category service in the same transaction. */
    path: ltree("path").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** 1 = root … 3 = deepest level (decision 10.1: max depth 3). */
    depth: smallint("depth").notNull(),
    /** Order among siblings. */
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("categories_slug_uq").on(t.slug),
    uniqueIndex("categories_path_uq").on(t.path),
    index("categories_path_gist").using("gist", t.path),
    index("categories_parent_idx").on(t.parentId, t.position),
    // Self-reference via foreignKey() avoids a circular type in the column definition.
    foreignKey({ name: "categories_parent_fk", columns: [t.parentId], foreignColumns: [t.id] }),
    check("categories_depth_range", sql`${t.depth} BETWEEN 1 AND 3`),
    check("categories_root_depth", sql`(${t.parentId} IS NULL) = (${t.depth} = 1)`),
  ],
);

export const attributeType = pgEnum("attribute_type", ["number", "enum", "boolean", "text"]);

export const categoryAttributes = pgTable(
  "category_attributes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id").notNull().references(() => categories.id),
    /** Stable machine key used in JSONB, CSV headers and Meilisearch (`attr_<key>`). Includes the unit: `capacity_l`. */
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: attributeType("type").notNull(),
    /** Canonical unit (W, mm, l, kg, °C, cm, pcs). Values are stored ONLY in this unit; no conversion in MVP. */
    unit: text("unit"),
    required: boolean("required").notNull().default(false),
    filterable: boolean("filterable").notNull().default(false),
    sortable: boolean("sortable").notNull().default(false),
    /** enum only: `[{ "value": "stainless_steel", "label": "Stainless steel" }]`. Options can be added, never removed. */
    options: jsonb("options").$type<{ value: string; label: string }[]>(),
    /** number only. numeric (not money) — e.g. 0.5 kg. */
    minValue: numeric("min_value"),
    maxValue: numeric("max_value"),
    position: integer("position").notNull().default(0),
    /** Deactivate instead of delete: hidden from forms/filters, existing values kept (decision 10.2). */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("category_attributes_category_key_uq").on(t.categoryId, t.key),
    check("category_attributes_key_format", sql`${t.key} ~ '^[a-z][a-z0-9_]{1,40}$'`),
    check("category_attributes_enum_options", sql`${t.type} <> 'enum' OR coalesce(jsonb_typeof(${t.options}), '') = 'array'`),
    check("category_attributes_minmax_number_only", sql`${t.type} = 'number' OR (${t.minValue} IS NULL AND ${t.maxValue} IS NULL)`),
    check("category_attributes_sortable_scalar", sql`NOT ${t.sortable} OR ${t.type} IN ('number', 'text')`),
    // "Key unique along the ancestor path" (inheritance without overrides) is checked in the category service.
  ],
);

// ───────────────────────── products ─────────────────────────

export const productStatus = pgEnum("product_status", ["draft", "active", "archived"]);
export const productUnit = pgEnum("product_unit", ["piece", "box", "pack", "kg", "l", "m"]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierOrgId: text("supplier_org_id").notNull().references(() => organization.id),
    /** Must be a leaf category (checked in the product service). */
    categoryId: uuid("category_id").notNull().references(() => categories.id),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    brand: text("brand"),
    /** Optional GTIN/EAN — lets "compare offers" find the same item at other suppliers (decision 10.4). */
    gtin: text("gtin"),
    /** Manufacturer part number. */
    mpn: text("mpn"),
    unit: productUnit("unit").notNull().default("piece"),
    minOrderQty: integer("min_order_qty").notNull().default(1),
    /** Quantity must be ≥ min_order_qty and a multiple of order_step (e.g. boxes of 6); min_order_qty is itself a multiple of the step. */
    orderStep: integer("order_step").notNull().default(1),
    /** Net unit price in cents. Only the base price lives here; S1 tiers / buyer prices are separate tables. */
    basePriceCents: cents("base_price_cents").notNull(),
    /** Basis points (2100 = 21 %). Allowed values come from config — verify Montenegrin rates. */
    vatRateBps: integer("vat_rate_bps").notNull(),
    status: productStatus("status").notNull().default("draft"),
    /** Validated against the category's effective attribute definitions; canonical units; JSON numbers for numbers. */
    attributes: jsonb("attributes").$type<Record<string, string | number | boolean>>().notNull().default({}),
    csvImportId: uuid("csv_import_id").references(() => csvImports.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_supplier_sku_uq").on(t.supplierOrgId, t.sku),
    index("products_supplier_status_updated_idx").on(t.supplierOrgId, t.status, t.updatedAt.desc()),
    index("products_category_idx").on(t.categoryId),
    index("products_gtin_idx").on(t.gtin),
    // Fallback search only (Meilisearch is primary).
    index("products_name_trgm").using("gin", t.name.op("gin_trgm_ops")),
    check("products_price_positive", sql`${t.basePriceCents} > 0`),
    check("products_vat_range", sql`${t.vatRateBps} BETWEEN 0 AND 10000`),
    check("products_qty_rules", sql`${t.minOrderQty} >= 1 AND ${t.orderStep} >= 1 AND ${t.minOrderQty} % ${t.orderStep} = 0`),
    check("products_gtin_format", sql`${t.gtin} IS NULL OR ${t.gtin} ~ '^([0-9]{8}|[0-9]{12,14})$'`),
    check("products_attributes_object", sql`jsonb_typeof(${t.attributes}) = 'object'`),
  ],
);

export const imageStatus = pgEnum("image_status", ["pending", "ready", "failed"]);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id),
    /** Denormalised from products for a simple RLS write policy. */
    supplierOrgId: text("supplier_org_id").notNull().references(() => organization.id),
    /** 0 = main image. Max 8 images per product (checked in the service). */
    position: smallint("position").notNull(),
    alt: text("alt"),
    originalKey: text("original_key").notNull(),
    /** Set by the thumbnail job (sharp, WebP, 480 px wide). NULL while pending. */
    thumbKey: text("thumb_key"),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    status: imageStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_images_product_position_uq").on(t.productId, t.position),
    check("product_images_type", sql`${t.contentType} IN ('image/jpeg', 'image/png', 'image/webp')`),
    check("product_images_size", sql`${t.sizeBytes} BETWEEN 1 AND 5242880`),
    check("product_images_position", sql`${t.position} BETWEEN 0 AND 7`),
  ],
);

// ───────────────────────── CSV import ─────────────────────────

export const importStatus = pgEnum("import_status", [
  "uploaded", "validating", "validated", "importing", "completed", "failed", "cancelled",
]);

export const csvImports = pgTable(
  "csv_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierOrgId: text("supplier_org_id").notNull().references(() => organization.id),
    /** One leaf category per file (decision 10.7); the template columns come from its attributes. */
    categoryId: uuid("category_id").notNull().references(() => categories.id),
    createdByUserId: text("created_by_user_id").notNull().references(() => user.id),
    fileKey: text("file_key").notNull(),
    filename: text("filename").notNull(),
    status: importStatus("status").notNull().default("uploaded"),
    totalRows: integer("total_rows").notNull().default(0),
    validRows: integer("valid_rows").notNull().default(0),
    invalidRows: integer("invalid_rows").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    /** `[{ row, column, message }]`, capped at 1,000 entries; full error CSV is generated from the file. */
    report: jsonb("report").$type<{ row: number; column: string; message: string }[]>().notNull().default([]),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("csv_imports_supplier_created_idx").on(t.supplierOrgId, t.createdAt.desc()),
    // One running import per supplier.
    uniqueIndex("csv_imports_one_active_uq")
      .on(t.supplierOrgId)
      .where(sql`${t.status} IN ('uploaded', 'validating', 'validated', 'importing')`),
    check("csv_imports_counts", sql`${t.validRows} + ${t.invalidRows} = ${t.totalRows} AND ${t.totalRows} <= 5000`),
  ],
);
