CREATE TYPE "public"."stock_status" AS ENUM('ok', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'succeeded', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."agreement_status" AS ENUM('requested', 'active', 'rejected', 'ended');--> statement-breakpoint
CREATE TABLE "product_stock" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"available_qty" integer,
	"status" "stock_status" NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "product_stock_qty" CHECK (("product_stock"."status" = 'ok') = ("product_stock"."available_qty" IS NOT NULL)
          AND ("product_stock"."available_qty" IS NULL OR "product_stock"."available_qty" >= 0))
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
	"refunded_cents" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_ref_unique" UNIQUE("provider_ref"),
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_cents" > 0),
	CONSTRAINT "payments_refunded" CHECK ("payments"."refunded_cents" BETWEEN 0 AND "payments"."amount_cents"
          AND ("payments"."refunded_cents" = 0 OR "payments"."status" = 'succeeded'))
);
--> statement-breakpoint
CREATE TABLE "supplier_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_org_id" text NOT NULL,
	"supplier_org_id" text NOT NULL,
	"status" "agreement_status" DEFAULT 'requested' NOT NULL,
	"payment_term_days" integer,
	"buyer_note" text,
	"supplier_note" text,
	"requested_by_user_id" text NOT NULL,
	"decided_by_user_id" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	CONSTRAINT "supplier_agreements_buyer_not_supplier" CHECK ("supplier_agreements"."buyer_org_id" <> "supplier_agreements"."supplier_org_id"),
	CONSTRAINT "supplier_agreements_term" CHECK ("supplier_agreements"."payment_term_days" IS NULL OR "supplier_agreements"."payment_term_days" BETWEEN 0 AND 365),
	CONSTRAINT "supplier_agreements_decision" CHECK (("supplier_agreements"."status" = 'requested') = ("supplier_agreements"."decided_at" IS NULL AND "supplier_agreements"."decided_by_user_id" IS NULL)
          AND ("supplier_agreements"."status" = 'ended') = ("supplier_agreements"."ended_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "order_payments" DROP CONSTRAINT "order_payments_payment_id_unique";--> statement-breakpoint
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_agreements" ADD CONSTRAINT "supplier_agreements_buyer_org_id_organization_id_fk" FOREIGN KEY ("buyer_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_agreements" ADD CONSTRAINT "supplier_agreements_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_agreements" ADD CONSTRAINT "supplier_agreements_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_agreements" ADD CONSTRAINT "supplier_agreements_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_events_payment_idx" ON "payment_events" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_succeeded_per_order_uq" ON "payments" USING btree ("order_id") WHERE "payments"."status" = 'succeeded';--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_agreements_one_open_uq" ON "supplier_agreements" USING btree ("buyer_org_id","supplier_org_id") WHERE "supplier_agreements"."status" IN ('requested', 'active');--> statement-breakpoint
CREATE INDEX "supplier_agreements_supplier_idx" ON "supplier_agreements" USING btree ("supplier_org_id","status");--> statement-breakpoint
CREATE INDEX "supplier_agreements_buyer_idx" ON "supplier_agreements" USING btree ("buyer_org_id","status");--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_one_receipt_per_payment_uq" ON "order_payments" USING btree ("payment_id") WHERE "order_payments"."type" = 'receipt';
--> statement-breakpoint
-- ── D5-B0 hand-written part: grants, RLS, guard trigger, SECURITY DEFINER function (APPLIED.md §4 · D5-B0).
-- Same layering as 0005: policy.can + scoped queries are the first line, this is the second. RLS is ENABLEd, not
-- FORCEd: the owner and the SECURITY DEFINER functions bypass it by design.

-- ───────────── 1. Grants ("a new table ships with its grants") ─────────────
-- Contracts: web reads and inserts; UPDATE only on the decision fields (buyer_note and the requested_* fields can
-- never change). The worker reads them (e-mail jobs).
GRANT SELECT, INSERT ON "supplier_agreements" TO horeca_app;--> statement-breakpoint
GRANT UPDATE ("status", "payment_term_days", "supplier_note", "decided_by_user_id", "decided_at", "ended_at") ON "supplier_agreements" TO horeca_app;--> statement-breakpoint
GRANT SELECT ON "supplier_agreements" TO horeca_worker;--> statement-breakpoint
-- Payments: the buyer creates an attempt and marks it `pending` after the gateway answered (the only update the web
-- login may do); the worker writes everything that follows from signed gateway events.
GRANT SELECT, INSERT ON "payments" TO horeca_app;--> statement-breakpoint
GRANT UPDATE ("status", "provider_ref", "updated_at") ON "payments" TO horeca_app;--> statement-breakpoint
GRANT SELECT ON "payments" TO horeca_worker;--> statement-breakpoint
GRANT UPDATE ("status", "provider_ref", "refunded_cents", "updated_at") ON "payments" TO horeca_worker;--> statement-breakpoint
-- payment_events: worker only, insert-only. The web login has no access at all in the MVP.
GRANT SELECT, INSERT ON "payment_events" TO horeca_worker;--> statement-breakpoint
-- The worker records receipts and refunds (0004 granted it SELECT only).
GRANT INSERT ON "order_payments" TO horeca_worker;--> statement-breakpoint
-- Stock cache: everyone reads (rows follow product visibility), the worker writes.
GRANT SELECT ON "product_stock" TO horeca_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "product_stock" TO horeca_worker;--> statement-breakpoint

-- ───────────── 2. Enable RLS ─────────────
ALTER TABLE supplier_agreements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product_stock ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY worker_read ON supplier_agreements FOR SELECT TO horeca_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_read ON payments FOR SELECT TO horeca_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_read ON payment_events FOR SELECT TO horeca_worker USING (true);--> statement-breakpoint
CREATE POLICY worker_read ON product_stock FOR SELECT TO horeca_worker USING (true);--> statement-breakpoint

-- ───────────── 3. Contracts (supplier_agreements) ─────────────
-- Read: the two sides and the platform.
CREATE POLICY supplier_agreements_read ON supplier_agreements FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR (supplier_org_id = app.org_id() AND app.is_supplier()) OR app.is_platform());--> statement-breakpoint
-- A buyer member asks for a contract with an APPROVED supplier (it can read approved supplier profiles); the row
-- starts `requested` with nobody having decided it.
CREATE POLICY supplier_agreements_insert ON supplier_agreements FOR INSERT TO horeca_app WITH CHECK (
  buyer_org_id = app.org_id() AND app.is_buyer() AND status = 'requested'
  AND requested_by_user_id = app.user_id()
  AND decided_by_user_id IS NULL AND decided_at IS NULL AND ended_at IS NULL AND supplier_note IS NULL
  AND EXISTS (SELECT 1 FROM org_profiles op
              WHERE op.organization_id = supplier_agreements.supplier_org_id AND op.type = 'supplier' AND op.status = 'approved'));--> statement-breakpoint
-- Who may touch a row: any member of the supplier (decides), or the OWNER of the buyer (ends). Which transition
-- is legal, and for whom, is the guard's job (RLS cannot see old vs new). The platform has no UPDATE.
CREATE POLICY supplier_agreements_update ON supplier_agreements FOR UPDATE TO horeca_app
  USING ((supplier_org_id = app.org_id() AND app.is_supplier())
         OR (buyer_org_id = app.org_id() AND app.is_buyer() AND app.member_role() = 'owner'))
  WITH CHECK ((supplier_org_id = app.org_id() AND app.is_supplier())
              OR (buyer_org_id = app.org_id() AND app.is_buyer() AND app.member_role() = 'owner'));--> statement-breakpoint

CREATE FUNCTION app.supplier_agreements_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'horeca_app' THEN RETURN NEW; END IF;
  -- Every update is a status change (the notes and the term are set together with the decision).
  IF NEW.status = OLD.status THEN RAISE EXCEPTION 'an agreement can only change its status'; END IF;

  IF OLD.status = 'requested' AND NEW.status IN ('active', 'rejected') THEN
    -- agreement.accept / agreement.reject: a member of the supplier decides, in its own name.
    IF NOT (app.is_supplier() AND app.org_id() = OLD.supplier_org_id) THEN
      RAISE EXCEPTION 'only the supplier can accept or reject an agreement request';
    END IF;
    IF NEW.decided_by_user_id IS DISTINCT FROM app.user_id() THEN RAISE EXCEPTION 'decided_by_user_id must be the acting user'; END IF;
    IF NEW.ended_at IS NOT NULL THEN RAISE EXCEPTION 'a decision does not end the agreement'; END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'active' AND NEW.status = 'ended' THEN
    -- agreement.end: the OWNER of either side; the decision and the notes stay as they were.
    IF NOT (app.member_role() = 'owner'
            AND ((app.is_buyer() AND app.org_id() = OLD.buyer_org_id) OR (app.is_supplier() AND app.org_id() = OLD.supplier_org_id))) THEN
      RAISE EXCEPTION 'only the owner of the buyer or of the supplier can end an agreement';
    END IF;
    IF NEW.decided_by_user_id IS DISTINCT FROM OLD.decided_by_user_id OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
       OR NEW.supplier_note IS DISTINCT FROM OLD.supplier_note OR NEW.payment_term_days IS DISTINCT FROM OLD.payment_term_days THEN
      RAISE EXCEPTION 'ending an agreement does not change its decision';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'illegal agreement transition % -> %', OLD.status, NEW.status;
END $$;--> statement-breakpoint
CREATE TRIGGER supplier_agreements_guard BEFORE UPDATE ON supplier_agreements
  FOR EACH ROW EXECUTE FUNCTION app.supplier_agreements_guard();--> statement-breakpoint

-- Second layer for direct mode (012 §4, replaces the 0005 policy): a `direct` sub-order needs an ACTIVE agreement
-- between exactly this buyer and supplier. The domain revalidates it inside the checkout transaction as well.
DROP POLICY sub_orders_insert ON sub_orders;--> statement-breakpoint
CREATE POLICY sub_orders_insert ON sub_orders FOR INSERT TO horeca_app WITH CHECK (
  buyer_org_id = app.org_id() AND app.is_buyer() AND status = 'pending'
  AND supplier_submission = 'pending' AND order_payment_status = 'unpaid'
  AND EXISTS (SELECT 1 FROM orders o WHERE o.id = sub_orders.order_id AND o.buyer_org_id = app.org_id())
  AND (mode <> 'direct' OR EXISTS (SELECT 1 FROM supplier_agreements a
                                   WHERE a.buyer_org_id = sub_orders.buyer_org_id AND a.supplier_org_id = sub_orders.supplier_org_id
                                     AND a.status = 'active')));--> statement-breakpoint

-- ───────────── 4. Card payments ─────────────
CREATE POLICY payments_read ON payments FOR SELECT TO horeca_app USING (
  (buyer_org_id = app.org_id() AND app.is_buyer()) OR app.is_platform());--> statement-breakpoint
-- A new attempt: own buyer, `created`, nothing refunded, no provider reference yet, for an order that still has a
-- platform part to pay (the amount itself is the domain's job; order status and receipts are derived from
-- order_payments, so a wrong amount here can never make an order "paid").
CREATE POLICY payments_insert ON payments FOR INSERT TO horeca_app WITH CHECK (
  buyer_org_id = app.org_id() AND app.is_buyer()
  AND status = 'created' AND refunded_cents = 0 AND provider_ref IS NULL
  AND EXISTS (SELECT 1 FROM sub_orders s WHERE s.order_id = payments.order_id AND s.buyer_org_id = app.org_id()
              AND s.mode = 'platform' AND s.status <> 'cancelled'));--> statement-breakpoint
-- The buyer's request marks its own `created` attempt `pending` once the gateway answered (provider reference set).
-- The column grant limits it to status / provider_ref / updated_at; everything after `pending` is the worker's.
CREATE POLICY payments_update ON payments FOR UPDATE TO horeca_app
  USING (buyer_org_id = app.org_id() AND app.is_buyer() AND status = 'created')
  WITH CHECK (buyer_org_id = app.org_id() AND app.is_buyer() AND status = 'pending' AND provider_ref IS NOT NULL);--> statement-breakpoint
-- The worker's column grant (status, provider_ref, refunded_cents, updated_at) is what limits it; the policy lets rows through.
CREATE POLICY payments_worker_update ON payments FOR UPDATE TO horeca_worker USING (true) WITH CHECK (true);--> statement-breakpoint

-- payment_events: insert-only for the worker (no UPDATE / DELETE grant); the web login has no grant, so no policy.
CREATE POLICY payment_events_worker_insert ON payment_events FOR INSERT TO horeca_worker WITH CHECK (true);--> statement-breakpoint

-- order_payments (decision 012 §4, amended): the worker inserts a receipt on payment.succeeded and a refund on
-- refund.succeeded — always for a succeeded payment, with payment_id set, no recording user, and order / buyer
-- matching that payment; a receipt carries exactly the payment's amount, a refund at most that.
CREATE POLICY order_payments_worker_insert ON order_payments FOR INSERT TO horeca_worker WITH CHECK (
  type IN ('receipt', 'refund') AND payment_id IS NOT NULL AND recorded_by_user_id IS NULL
  AND EXISTS (SELECT 1 FROM payments p
              WHERE p.id = order_payments.payment_id AND p.status = 'succeeded'
                AND p.order_id = order_payments.order_id AND p.buyer_org_id = order_payments.buyer_org_id
                AND CASE order_payments.type WHEN 'receipt' THEN order_payments.amount_cents = p.amount_cents
                                             ELSE order_payments.amount_cents <= p.amount_cents END));--> statement-breakpoint

-- ───────────── 5. Stock cache ─────────────
-- Visible exactly when the product is visible (the subquery runs under products' RLS), like product_images.
CREATE POLICY product_stock_read ON product_stock FOR SELECT TO horeca_app USING (
  EXISTS (SELECT 1 FROM products p WHERE p.id = product_stock.product_id));--> statement-breakpoint
CREATE POLICY product_stock_worker_insert ON product_stock FOR INSERT TO horeca_worker WITH CHECK (true);--> statement-breakpoint
CREATE POLICY product_stock_worker_update ON product_stock FOR UPDATE TO horeca_worker USING (true) WITH CHECK (true);--> statement-breakpoint

-- ───────────── 6. app.system_cancel_sub_order ─────────────
-- The one way the system (worker: payment expiry, supplier-API rejection) cancels a sub-order — CLAUDE.md rule 10.
-- Same rules as a cancellation by a person (pending or confirmed). Already cancelled → no-op, so a job may run twice.
-- The reversals MIRROR the sub-order's own checkout entries, so they are right for the mode by construction:
-- platform → sale_reversal + commission_reversal, direct → commission_reversal only, and the entries sum to 0.
CREATE FUNCTION app.system_cancel_sub_order(p_sub_order_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s sub_orders%ROWTYPE;
BEGIN
  IF NOT (session_user = 'horeca_worker' OR current_setting('role', true) = 'horeca_worker') THEN
    RAISE EXCEPTION 'system_cancel_sub_order: only the worker may call this';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'a cancel reason is required'; END IF;

  SELECT * INTO s FROM sub_orders WHERE id = p_sub_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sub-order not found'; END IF;
  IF s.status = 'cancelled' THEN RETURN; END IF;
  IF s.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'sub-order is % and can no longer be cancelled', s.status;
  END IF;

  UPDATE sub_orders SET status = 'cancelled', cancel_reason = p_reason, cancelled_by_user_id = NULL, status_changed_at = now()
   WHERE id = s.id;
  INSERT INTO sub_order_events (sub_order_id, buyer_org_id, supplier_org_id, from_status, to_status, actor_user_id, actor_org_id, note)
  VALUES (s.id, s.buyer_org_id, s.supplier_org_id, s.status, 'cancelled', NULL, NULL, p_reason);

  INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description)
  SELECT s.supplier_org_id, s.id, 'sale_reversal', -e.amount_cents, 'sale reversed: ' || p_reason
    FROM ledger_entries e WHERE e.sub_order_id = s.id AND e.type = 'sale';
  INSERT INTO ledger_entries (supplier_org_id, sub_order_id, type, amount_cents, description)
  SELECT s.supplier_org_id, s.id, 'commission_reversal', -e.amount_cents, 'commission reversed: ' || p_reason
    FROM ledger_entries e WHERE e.sub_order_id = s.id AND e.type = 'commission';

  PERFORM app.recompute_order(s.order_id);
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app.system_cancel_sub_order(uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.system_cancel_sub_order(uuid, text) TO horeca_worker;
