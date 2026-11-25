CREATE TYPE "public"."org_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('buyer', 'supplier', 'platform');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	CONSTRAINT "org_profiles_rejection_reason" CHECK ("org_profiles"."status" <> 'rejected' OR "org_profiles"."rejection_reason" IS NOT NULL),
	CONSTRAINT "org_profiles_tax_id_format" CHECK ("org_profiles"."tax_id" ~ '^([0-9]{8}|[0-9]{13})$')
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
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_locations" ADD CONSTRAINT "buyer_locations_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."org_profiles"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_profiles" ADD CONSTRAINT "org_profiles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_profiles" ADD CONSTRAINT "org_profiles_status_changed_by_user_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_profiles" ADD CONSTRAINT "supplier_profiles_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."org_profiles"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "buyer_locations_org_idx" ON "buyer_locations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_locations_one_default_uq" ON "buyer_locations" USING btree ("organization_id") WHERE "buyer_locations"."is_default" AND "buyer_locations"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "org_profiles_tax_id_type_uq" ON "org_profiles" USING btree ("tax_id","type");--> statement-breakpoint
CREATE INDEX "org_profiles_type_status_idx" ON "org_profiles" USING btree ("type","status");--> statement-breakpoint
-- ── Grants (rls.sql §3, APPLIED.md "grants come with the tables") — added by hand after drizzle-kit generate.
-- RLS policies and ENABLE ROW LEVEL SECURITY come on D4. Better Auth tables never get RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", "session", "account", "verification", "organization", "member", "invitation" TO horeca_app;--> statement-breakpoint
GRANT SELECT ON "user", "session", "account", "verification", "organization", "member", "invitation" TO horeca_worker;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "org_profiles", "supplier_profiles", "buyer_locations" TO horeca_app;--> statement-breakpoint
GRANT SELECT ON "org_profiles", "supplier_profiles", "buyer_locations" TO horeca_worker;
