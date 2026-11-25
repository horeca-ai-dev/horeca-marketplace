CREATE TYPE "public"."attribute_type" AS ENUM('number', 'enum', 'boolean', 'text');--> statement-breakpoint
CREATE TYPE "public"."image_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('uploaded', 'validating', 'validated', 'importing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."product_unit" AS ENUM('piece', 'box', 'pack', 'kg', 'l', 'm');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"path" "ltree" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"depth" smallint NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_depth_range" CHECK ("categories"."depth" BETWEEN 1 AND 3),
	CONSTRAINT "categories_root_depth" CHECK (("categories"."parent_id" IS NULL) = ("categories"."depth" = 1))
);
--> statement-breakpoint
CREATE TABLE "category_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "attribute_type" NOT NULL,
	"unit" text,
	"required" boolean DEFAULT false NOT NULL,
	"filterable" boolean DEFAULT false NOT NULL,
	"sortable" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"min_value" numeric,
	"max_value" numeric,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_attributes_key_format" CHECK ("category_attributes"."key" ~ '^[a-z][a-z0-9_]{1,40}$'),
	CONSTRAINT "category_attributes_enum_options" CHECK ("category_attributes"."type" <> 'enum' OR coalesce(jsonb_typeof("category_attributes"."options"), '') = 'array'),
	CONSTRAINT "category_attributes_minmax_number_only" CHECK ("category_attributes"."type" = 'number' OR ("category_attributes"."min_value" IS NULL AND "category_attributes"."max_value" IS NULL)),
	CONSTRAINT "category_attributes_sortable_scalar" CHECK (NOT "category_attributes"."sortable" OR "category_attributes"."type" IN ('number', 'text'))
);
--> statement-breakpoint
CREATE TABLE "csv_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_org_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"file_key" text NOT NULL,
	"filename" text NOT NULL,
	"status" "import_status" DEFAULT 'uploaded' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"invalid_rows" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"report" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validated_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "csv_imports_counts" CHECK ("csv_imports"."valid_rows" + "csv_imports"."invalid_rows" = "csv_imports"."total_rows" AND "csv_imports"."total_rows" <= 5000)
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_org_id" text NOT NULL,
	"position" smallint NOT NULL,
	"alt" text,
	"original_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"status" "image_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_type" CHECK ("product_images"."content_type" IN ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "product_images_size" CHECK ("product_images"."size_bytes" BETWEEN 1 AND 5242880),
	CONSTRAINT "product_images_position" CHECK ("product_images"."position" BETWEEN 0 AND 7)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_org_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"brand" text,
	"gtin" text,
	"mpn" text,
	"unit" "product_unit" DEFAULT 'piece' NOT NULL,
	"min_order_qty" integer DEFAULT 1 NOT NULL,
	"order_step" integer DEFAULT 1 NOT NULL,
	"base_price_cents" bigint NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"csv_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_positive" CHECK ("products"."base_price_cents" > 0),
	CONSTRAINT "products_vat_range" CHECK ("products"."vat_rate_bps" BETWEEN 0 AND 10000),
	CONSTRAINT "products_qty_rules" CHECK ("products"."min_order_qty" >= 1 AND "products"."order_step" >= 1 AND "products"."min_order_qty" % "products"."order_step" = 0),
	CONSTRAINT "products_gtin_format" CHECK ("products"."gtin" IS NULL OR "products"."gtin" ~ '^([0-9]{8}|[0-9]{12,14})$'),
	CONSTRAINT "products_attributes_object" CHECK (jsonb_typeof("products"."attributes") = 'object')
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_csv_import_id_csv_imports_id_fk" FOREIGN KEY ("csv_import_id") REFERENCES "public"."csv_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_path_uq" ON "categories" USING btree ("path");--> statement-breakpoint
CREATE INDEX "categories_path_gist" ON "categories" USING gist ("path");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "category_attributes_category_key_uq" ON "category_attributes" USING btree ("category_id","key");--> statement-breakpoint
CREATE INDEX "csv_imports_supplier_created_idx" ON "csv_imports" USING btree ("supplier_org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "csv_imports_one_active_uq" ON "csv_imports" USING btree ("supplier_org_id") WHERE "csv_imports"."status" IN ('uploaded', 'validating', 'validated', 'importing');--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_product_position_uq" ON "product_images" USING btree ("product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "products_supplier_sku_uq" ON "products" USING btree ("supplier_org_id","sku");--> statement-breakpoint
CREATE INDEX "products_supplier_status_updated_idx" ON "products" USING btree ("supplier_org_id","status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_gtin_idx" ON "products" USING btree ("gtin");--> statement-breakpoint
-- ── Grants (rls.sql §3, APPLIED.md "a new table ships with its grants") — added by hand after drizzle-kit generate.
-- RLS policies and ENABLE ROW LEVEL SECURITY come on D4-B2.
-- Products are archived, never deleted: no DELETE grant on products or csv_imports. Product images may be deleted.
GRANT SELECT, INSERT, UPDATE ON "categories", "category_attributes" TO horeca_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "products", "csv_imports" TO horeca_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "product_images" TO horeca_app;--> statement-breakpoint
-- Worker: reads what its jobs need; writes only the columns the image job owns (APPLIED.md D3-B2: no thumb_key).
-- csv_imports stays SELECT-only for the worker: the import job runs as horeca_app with the supplier actor (D6-B2).
GRANT SELECT ON "categories", "category_attributes", "products", "product_images", "csv_imports" TO horeca_worker;--> statement-breakpoint
GRANT UPDATE ("status", "width", "height") ON "product_images" TO horeca_worker;
