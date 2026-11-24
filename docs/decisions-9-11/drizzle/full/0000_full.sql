CREATE TYPE "public"."attribute_type" AS ENUM('number', 'enum', 'boolean', 'text');--> statement-breakpoint
CREATE TYPE "public"."image_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('uploaded', 'validating', 'validated', 'importing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."product_unit" AS ENUM('piece', 'box', 'pack', 'kg', 'l', 'm');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('sale', 'commission', 'sale_reversal', 'commission_reversal', 'payout', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('buyer', 'supplier', 'platform');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('issued', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('unpaid', 'paid', 'refund_due');--> statement-breakpoint
CREATE TYPE "public"."order_payment_type" AS ENUM('receipt', 'refund');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('cart', 'rfq');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('proforma', 'bank_transfer', 'card');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('base', 'tier', 'buyer', 'rfq');--> statement-breakpoint
CREATE TYPE "public"."sub_order_status" AS ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."rfq_quote_status" AS ENUM('submitted', 'accepted', 'rejected', 'withdrawn', 'expired');--> statement-breakpoint
CREATE TYPE "public"."rfq_status" AS ENUM('open', 'quoted', 'accepted', 'closed', 'expired');--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
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
	"thumb_key" text,
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
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"actor_org_id" text,
	"actor_org_type" "org_type",
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_counters_non_negative" CHECK ("invoice_counters"."last_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ledger_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"supplier_org_id" text NOT NULL,
	"sub_order_id" uuid,
	"type" "ledger_entry_type" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_sub_order_link" CHECK (("ledger_entries"."type" IN ('sale', 'commission', 'sale_reversal', 'commission_reversal')) = ("ledger_entries"."sub_order_id" IS NOT NULL)),
	CONSTRAINT "ledger_entries_sign" CHECK (CASE "ledger_entries"."type"
            WHEN 'sale' THEN "ledger_entries"."amount_cents" > 0
            WHEN 'commission_reversal' THEN "ledger_entries"."amount_cents" >= 0
            WHEN 'commission' THEN "ledger_entries"."amount_cents" <= 0
            WHEN 'sale_reversal' THEN "ledger_entries"."amount_cents" < 0
            WHEN 'payout' THEN "ledger_entries"."amount_cents" < 0
            ELSE "ledger_entries"."amount_cents" <> 0 END)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"label" text NOT NULL,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" char(2) DEFAULT 'ME' NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_profiles" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"type" "org_type" NOT NULL,
	"status" "org_status" NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text NOT NULL,
	"vat_number" text,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" char(2) DEFAULT 'ME' NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"rejection_reason" text,
	"status_changed_at" timestamp with time zone,
	"status_changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_profiles_status_by_type" CHECK ("org_profiles"."type" = 'supplier' OR "org_profiles"."status" = 'approved'),
	CONSTRAINT "org_profiles_rejection_reason" CHECK ("org_profiles"."status" <> 'rejected' OR "org_profiles"."rejection_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "supplier_profiles" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"iban" text,
	"commission_override_bps" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_profiles_commission_range" CHECK ("supplier_profiles"."commission_override_bps" IS NULL OR "supplier_profiles"."commission_override_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"buyer_org_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents_seen" bigint NOT NULL,
	"added_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_quantity_positive" CHECK ("cart_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_org_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_buyer_org_id_unique" UNIQUE("buyer_org_id")
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_order_id" uuid NOT NULL,
	"buyer_org_id" text NOT NULL,
	"supplier_org_id" text NOT NULL,
	"product_id" uuid,
	"position" smallint NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"price_source" "price_source" DEFAULT 'base' NOT NULL,
	"quantity" integer NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	"line_net_cents" bigint NOT NULL,
	"line_vat_cents" bigint NOT NULL,
	"line_gross_cents" bigint NOT NULL,
	CONSTRAINT "order_lines_quantity_positive" CHECK ("order_lines"."quantity" > 0 AND "order_lines"."unit_price_cents" > 0),
	CONSTRAINT "order_lines_net" CHECK ("order_lines"."line_net_cents" = "order_lines"."unit_price_cents" * "order_lines"."quantity"),
	CONSTRAINT "order_lines_gross" CHECK ("order_lines"."line_gross_cents" = "order_lines"."line_net_cents" + "order_lines"."line_vat_cents"),
	CONSTRAINT "order_lines_product_unless_rfq" CHECK ("order_lines"."price_source" = 'rfq' OR "order_lines"."product_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "order_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"buyer_org_id" text NOT NULL,
	"type" "order_payment_type" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"bank_reference" text,
	"payment_id" uuid,
	"recorded_by_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_payments_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "order_payments_positive" CHECK ("order_payments"."amount_cents" > 0),
	CONSTRAINT "order_payments_recorded" CHECK ("order_payments"."recorded_by_user_id" IS NOT NULL OR "order_payments"."payment_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"buyer_org_id" text NOT NULL,
	"placed_by_user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"source" "order_source" DEFAULT 'cart' NOT NULL,
	"rfq_quote_id" uuid,
	"payment_method" "payment_method" NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"buyer_snapshot" jsonb NOT NULL,
	"delivery_snapshot" jsonb NOT NULL,
	"net_cents" bigint NOT NULL,
	"vat_cents" bigint NOT NULL,
	"gross_cents" bigint NOT NULL,
	"status" "order_status" DEFAULT 'in_progress' NOT NULL,
	"payment_status" "order_payment_status" DEFAULT 'unpaid' NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_gross_sum" CHECK ("orders"."gross_cents" = "orders"."net_cents" + "orders"."vat_cents"),
	CONSTRAINT "orders_non_negative" CHECK ("orders"."net_cents" >= 0 AND "orders"."vat_cents" >= 0),
	CONSTRAINT "orders_rfq_source" CHECK (("orders"."source" = 'rfq') = ("orders"."rfq_quote_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "proforma_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"buyer_org_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"number" text NOT NULL,
	"issuer_snapshot" jsonb NOT NULL,
	"buyer_snapshot" jsonb NOT NULL,
	"content_snapshot" jsonb NOT NULL,
	"vat_breakdown" jsonb NOT NULL,
	"net_cents" bigint NOT NULL,
	"vat_cents" bigint NOT NULL,
	"gross_cents" bigint NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" date NOT NULL,
	"payment_reference" text NOT NULL,
	"status" "invoice_status" DEFAULT 'issued' NOT NULL,
	"storage_key" text,
	"pdf_generated_at" timestamp with time zone,
	CONSTRAINT "proforma_invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "proforma_invoices_gross_sum" CHECK ("proforma_invoices"."gross_cents" = "proforma_invoices"."net_cents" + "proforma_invoices"."vat_cents")
);
--> statement-breakpoint
CREATE TABLE "sub_order_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sub_order_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sub_order_id" uuid NOT NULL,
	"buyer_org_id" text NOT NULL,
	"supplier_org_id" text NOT NULL,
	"from_status" "sub_order_status",
	"to_status" "sub_order_status" NOT NULL,
	"actor_user_id" text,
	"actor_org_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"number" text NOT NULL,
	"buyer_org_id" text NOT NULL,
	"supplier_org_id" text NOT NULL,
	"status" "sub_order_status" DEFAULT 'pending' NOT NULL,
	"buyer_snapshot" jsonb NOT NULL,
	"delivery_snapshot" jsonb NOT NULL,
	"net_cents" bigint NOT NULL,
	"vat_cents" bigint NOT NULL,
	"gross_cents" bigint NOT NULL,
	"commission_bps" integer NOT NULL,
	"commission_cents" bigint NOT NULL,
	"order_payment_status" "order_payment_status" DEFAULT 'unpaid' NOT NULL,
	"buyer_note" text,
	"cancel_reason" text,
	"cancelled_by_user_id" text,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sub_orders_number_unique" UNIQUE("number"),
	CONSTRAINT "sub_orders_gross_sum" CHECK ("sub_orders"."gross_cents" = "sub_orders"."net_cents" + "sub_orders"."vat_cents"),
	CONSTRAINT "sub_orders_commission" CHECK ("sub_orders"."commission_bps" BETWEEN 0 AND 10000 AND "sub_orders"."commission_cents" BETWEEN 0 AND "sub_orders"."net_cents"),
	CONSTRAINT "sub_orders_cancel_reason" CHECK ("sub_orders"."status" <> 'cancelled' OR "sub_orders"."cancel_reason" IS NOT NULL),
	CONSTRAINT "sub_orders_buyer_not_supplier" CHECK ("sub_orders"."buyer_org_id" <> "sub_orders"."supplier_org_id")
);
--> statement-breakpoint
CREATE TABLE "buyer_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_org_id" text NOT NULL,
	"buyer_org_id" text NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyer_prices_values" CHECK ("buyer_prices"."unit_price_cents" > 0 AND ("buyer_prices"."valid_to" IS NULL OR "buyer_prices"."valid_to" >= "buyer_prices"."valid_from"))
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"payment_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"amount_cents" bigint,
	"raw" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"buyer_org_id" text NOT NULL,
	"provider" text DEFAULT 'mock' NOT NULL,
	"provider_ref" text,
	"idempotency_key" text NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"amount_cents" bigint NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_ref_unique" UNIQUE("provider_ref"),
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "price_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_org_id" text NOT NULL,
	"min_quantity" integer NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	CONSTRAINT "price_tiers_values" CHECK ("price_tiers"."min_quantity" > 1 AND "price_tiers"."unit_price_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "rfq_invitations" (
	"rfq_id" uuid NOT NULL,
	"supplier_org_id" text NOT NULL,
	"buyer_org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfq_invitations_rfq_id_supplier_org_id_pk" PRIMARY KEY("rfq_id","supplier_org_id")
);
--> statement-breakpoint
CREATE TABLE "rfq_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"supplier_org_id" text NOT NULL,
	"buyer_org_id" text NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	"lead_time_days" integer NOT NULL,
	"valid_until" date NOT NULL,
	"note" text,
	"status" "rfq_quote_status" DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfq_quotes_values" CHECK ("rfq_quotes"."unit_price_cents" > 0 AND "rfq_quotes"."lead_time_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rfq_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_org_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"category_id" uuid,
	"delivery_location_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"quantity" integer NOT NULL,
	"unit" text NOT NULL,
	"deadline" date NOT NULL,
	"status" "rfq_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_sub_order_id_sub_orders_id_fk" FOREIGN KEY ("sub_order_id") REFERENCES "public"."sub_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_locations" ADD CONSTRAINT "buyer_locations_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."org_profiles"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_profiles" ADD CONSTRAINT "org_profiles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_profiles" ADD CONSTRAINT "org_profiles_status_changed_by_user_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_profiles" ADD CONSTRAINT "supplier_profiles_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."org_profiles"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_added_by_user_id_user_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_sub_order_id_sub_orders_id_fk" FOREIGN KEY ("sub_order_id") REFERENCES "public"."sub_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_placed_by_user_id_user_id_fk" FOREIGN KEY ("placed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_order_events" ADD CONSTRAINT "sub_order_events_sub_order_id_sub_orders_id_fk" FOREIGN KEY ("sub_order_id") REFERENCES "public"."sub_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_order_events" ADD CONSTRAINT "sub_order_events_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_order_events" ADD CONSTRAINT "sub_order_events_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_order_events" ADD CONSTRAINT "sub_order_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_orders" ADD CONSTRAINT "sub_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_orders" ADD CONSTRAINT "sub_orders_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_orders" ADD CONSTRAINT "sub_orders_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_orders" ADD CONSTRAINT "sub_orders_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_prices" ADD CONSTRAINT "buyer_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_prices" ADD CONSTRAINT "buyer_prices_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_prices" ADD CONSTRAINT "buyer_prices_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_invitations" ADD CONSTRAINT "rfq_invitations_rfq_id_rfq_requests_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfq_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_invitations" ADD CONSTRAINT "rfq_invitations_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_invitations" ADD CONSTRAINT "rfq_invitations_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_rfq_id_rfq_requests_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfq_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_quotes" ADD CONSTRAINT "rfq_quotes_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_requests" ADD CONSTRAINT "rfq_requests_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_requests" ADD CONSTRAINT "rfq_requests_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_requests" ADD CONSTRAINT "rfq_requests_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_requests" ADD CONSTRAINT "rfq_requests_delivery_location_id_buyer_locations_id_fk" FOREIGN KEY ("delivery_location_id") REFERENCES "public"."buyer_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "products_name_trgm" ON "products" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_org_idx" ON "audit_log" USING btree ("actor_org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ledger_entries_supplier_created_idx" ON "ledger_entries" USING btree ("supplier_org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_once_per_sub_order_uq" ON "ledger_entries" USING btree ("sub_order_id","type") WHERE "ledger_entries"."type" IN ('sale', 'commission', 'sale_reversal', 'commission_reversal');--> statement-breakpoint
CREATE INDEX "buyer_locations_org_idx" ON "buyer_locations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_locations_one_default_uq" ON "buyer_locations" USING btree ("organization_id") WHERE "buyer_locations"."is_default" AND "buyer_locations"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "org_profiles_tax_id_type_uq" ON "org_profiles" USING btree ("tax_id","type");--> statement-breakpoint
CREATE INDEX "org_profiles_type_status_idx" ON "org_profiles" USING btree ("type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_product_uq" ON "cart_items" USING btree ("cart_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_sub_order_position_uq" ON "order_lines" USING btree ("sub_order_id","position");--> statement-breakpoint
CREATE INDEX "order_payments_order_idx" ON "order_payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_buyer_idempotency_uq" ON "orders" USING btree ("buyer_org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_buyer_placed_idx" ON "orders" USING btree ("buyer_org_id","placed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_status_placed_idx" ON "orders" USING btree ("status","placed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "proforma_invoices_order_version_uq" ON "proforma_invoices" USING btree ("order_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "proforma_invoices_one_issued_uq" ON "proforma_invoices" USING btree ("order_id") WHERE "proforma_invoices"."status" = 'issued';--> statement-breakpoint
CREATE INDEX "sub_order_events_sub_order_idx" ON "sub_order_events" USING btree ("sub_order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_orders_order_supplier_uq" ON "sub_orders" USING btree ("order_id","supplier_org_id");--> statement-breakpoint
CREATE INDEX "sub_orders_supplier_status_idx" ON "sub_orders" USING btree ("supplier_org_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sub_orders_buyer_idx" ON "sub_orders" USING btree ("buyer_org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sub_orders_order_idx" ON "sub_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "buyer_prices_lookup_idx" ON "buyer_prices" USING btree ("product_id","buyer_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_tiers_product_min_uq" ON "price_tiers" USING btree ("product_id","min_quantity");--> statement-breakpoint
CREATE UNIQUE INDEX "rfq_quotes_rfq_supplier_uq" ON "rfq_quotes" USING btree ("rfq_id","supplier_org_id");