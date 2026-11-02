CREATE SCHEMA "payments";
--> statement-breakpoint
CREATE TABLE "payments"."fx_rates" (
	"date" date PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'BCV' NOT NULL,
	"usd_ves" numeric(14, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments"."payment_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"reference" text NOT NULL,
	"status" text DEFAULT 'reported' NOT NULL,
	"note" text,
	"proof_media_id" uuid,
	"reported_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reports_method_reference_unique" UNIQUE("method","reference")
);
--> statement-breakpoint
ALTER TABLE "payments"."payment_reports" ADD CONSTRAINT "payment_reports_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments"."payment_reports" ADD CONSTRAINT "payment_reports_proof_media_id_media_id_fk" FOREIGN KEY ("proof_media_id") REFERENCES "media"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments"."payment_reports" ADD CONSTRAINT "payment_reports_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments"."payment_reports" ADD CONSTRAINT "payment_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_reports_order_idx" ON "payments"."payment_reports" USING btree ("order_id");--> statement-breakpoint

-- CHECKs de validez.
ALTER TABLE payments.payment_reports
  ADD CONSTRAINT payment_reports_status_chk CHECK (status IN ('reported','confirmed','rejected')),
  ADD CONSTRAINT payment_reports_method_chk CHECK (method IN (
    'pago_movil','transferencia','zelle','binance','efectivo','otro')),
  ADD CONSTRAINT payment_reports_amount_chk CHECK (amount >= 0);--> statement-breakpoint

-- RLS + grants. Esquema nuevo: USAGE al rol `app`.
GRANT USAGE ON SCHEMA payments TO app;--> statement-breakpoint

-- fx_rates: tabla de referencia, de SOLO LECTURA para la app (la carga seed/un
-- proceso externo con otro rol). Visible para todos (la tasa no es sensible).
GRANT SELECT ON payments.fx_rates TO app;--> statement-breakpoint
ALTER TABLE payments.fx_rates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY fx_rates_select ON payments.fx_rates FOR SELECT USING (true);--> statement-breakpoint

-- payment_reports: el Maker del pedido reporta (INSERT); la tienda revisa
-- (UPDATE del estado/revisor); ambos lo ven (SELECT). Visibilidad/escritura
-- derivadas del pedido (la subconsulta queda sujeta a la RLS de `orders`).
GRANT SELECT, INSERT, UPDATE ON payments.payment_reports TO app;--> statement-breakpoint
ALTER TABLE payments.payment_reports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY payment_reports_select ON payments.payment_reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = order_id
    AND (o.maker_id = authz.current_user_id() OR authz.is_store_member(o.store_id, NULL)))
);--> statement-breakpoint
-- Alta: solo el Maker dueño del pedido, y registrándose a sí mismo como reporter.
CREATE POLICY payment_reports_insert ON payments.payment_reports FOR INSERT WITH CHECK (
  reported_by = authz.current_user_id()
  AND EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = order_id
    AND o.maker_id = authz.current_user_id())
);--> statement-breakpoint
-- Revisión: solo un miembro de la tienda receptora.
CREATE POLICY payment_reports_update ON payments.payment_reports FOR UPDATE USING (
  EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = order_id
    AND authz.is_store_member(o.store_id, NULL))
) WITH CHECK (
  EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = order_id
    AND authz.is_store_member(o.store_id, NULL))
);