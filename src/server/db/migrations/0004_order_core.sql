CREATE TYPE "public"."invoice_status" AS ENUM('issued', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."order_payment_status" AS ENUM('unpaid', 'paid', 'refund_due', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."order_payment_type" AS ENUM('receipt', 'refund');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('cart', 'rfq');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('base', 'tier', 'buyer', 'rfq');--> statement-breakpoint
CREATE TYPE "public"."purchase_mode" AS ENUM('direct', 'platform');--> statement-breakpoint
CREATE TYPE "public"."sub_order_status" AS ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."supplier_submission" AS ENUM('pending', 'accepted', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('sale', 'commission', 'sale_reversal', 'commission_reversal', 'payout', 'adjustment', 'commission_payment');--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
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
	"mode" "purchase_mode" NOT NULL,
	"supplier_submission" "supplier_submission" DEFAULT 'pending' NOT NULL,
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
            WHEN 'commission_payment' THEN "ledger_entries"."amount_cents" > 0
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
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_sub_order_id_sub_orders_id_fk" FOREIGN KEY ("sub_order_id") REFERENCES "public"."sub_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_org_idx" ON "audit_log" USING btree ("actor_org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ledger_entries_supplier_created_idx" ON "ledger_entries" USING btree ("supplier_org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_once_per_sub_order_uq" ON "ledger_entries" USING btree ("sub_order_id","type") WHERE "ledger_entries"."type" IN ('sale', 'commission', 'sale_reversal', 'commission_reversal');
--> statement-breakpoint
-- ── Grants (rls.sql §3 with the APPLIED.md edits; "a new table ships with its grants") — added by hand.
-- RLS policies, the SECURITY DEFINER functions and ENABLE ROW LEVEL SECURITY come with D4-B2.
--
-- Web login. Append-only tables get no UPDATE and no DELETE: a correction is a new row (CLAUDE.md rule 9).
-- `orders` has no UPDATE either: its status columns are written only by app.recompute_order() (D4-B2).
GRANT SELECT, INSERT, UPDATE ON "carts", "settings" TO horeca_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "cart_items" TO horeca_app;--> statement-breakpoint
GRANT SELECT, INSERT ON "orders", "order_lines", "sub_order_events", "proforma_invoices", "order_payments", "ledger_entries", "audit_log" TO horeca_app;--> statement-breakpoint
-- A sub-order's money, snapshots and mode can never change after checkout: the web login may only
-- update the four columns of a status transition (APPLIED.md §2 · D4-B2 edit 2).
GRANT SELECT, INSERT ON "sub_orders" TO horeca_app;--> statement-breakpoint
GRANT UPDATE ("status", "cancel_reason", "cancelled_by_user_id", "status_changed_at") ON "sub_orders" TO horeca_app;--> statement-breakpoint
GRANT USAGE ON SEQUENCE "order_number_seq" TO horeca_app;--> statement-breakpoint
-- Worker login: reads what its jobs need and writes only the columns they own.
-- (Inserting order_payments receipts / refunds comes with D5-B0, together with `payments`.)
GRANT SELECT ON "orders", "sub_orders", "order_lines", "sub_order_events", "proforma_invoices", "order_payments", "ledger_entries", "settings" TO horeca_worker;--> statement-breakpoint
GRANT UPDATE ("supplier_submission") ON "sub_orders" TO horeca_worker;--> statement-breakpoint
GRANT UPDATE ("status", "storage_key", "pdf_generated_at") ON "proforma_invoices" TO horeca_worker;--> statement-breakpoint
GRANT INSERT ON "audit_log" TO horeca_worker;
