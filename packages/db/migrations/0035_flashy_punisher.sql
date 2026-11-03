CREATE TABLE "billing"."config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."fee_accruals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"community_id" uuid NOT NULL,
	"order_id" uuid,
	"shipment_id" uuid,
	"accrued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_accruals_order_unique" UNIQUE("order_id"),
	CONSTRAINT "fee_accruals_shipment_unique" UNIQUE("shipment_id")
);
--> statement-breakpoint
ALTER TABLE "billing"."fee_accruals" ADD CONSTRAINT "fee_accruals_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "community"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."fee_accruals" ADD CONSTRAINT "fee_accruals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."fee_accruals" ADD CONSTRAINT "fee_accruals_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "shipping"."shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_accruals_subject_idx" ON "billing"."fee_accruals" USING btree ("subject_type","subject_id","accrued_at");--> statement-breakpoint
CREATE INDEX "fee_accruals_community_idx" ON "billing"."fee_accruals" USING btree ("community_id");--> statement-breakpoint

-- CHECKs de dominio.
ALTER TABLE billing.fee_accruals
  ADD CONSTRAINT fee_accruals_subject_chk CHECK (subject_type IN ('store','mover')),
  ADD CONSTRAINT fee_accruals_kind_chk CHECK (kind IN ('sale','shipment')),
  ADD CONSTRAINT fee_accruals_amount_chk CHECK (amount >= 0);--> statement-breakpoint

-- RLS + grants. `config` es owner-only (sin grant a `app`; la leen los triggers).
-- `fee_accruals` es solo lectura para la app (la escriben los triggers definer); la
-- ve el sujeto (tienda/Mover) o un admin de su comunidad/plataforma.
ALTER TABLE billing.config ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT ON billing.fee_accruals TO app;--> statement-breakpoint
ALTER TABLE billing.fee_accruals ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY fee_accruals_select ON billing.fee_accruals FOR SELECT USING (
  (subject_type = 'store' AND authz.is_store_member(subject_id, NULL))
  OR (subject_type = 'mover' AND subject_id = authz.current_user_id())
  OR authz.is_community_admin(community_id)
  OR authz.is_platform_admin()
);--> statement-breakpoint

-- Devengo de la comisión de **venta**: al pasar el pedido a `completado`, se calcula
-- `total * commission_rate`, se graba en `orders.fee_amount` (BEFORE → modifica NEW)
-- y se inserta la comisión (sujeto = tienda). Una por pedido. SECURITY DEFINER:
-- billing escucha a orders sin acoplar orders→billing.
CREATE OR REPLACE FUNCTION billing.tg_accrue_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_rate numeric;
  v_fee numeric;
BEGIN
  IF NEW.status = 'completado' AND OLD.status IS DISTINCT FROM 'completado' THEN
    SELECT value::numeric INTO v_rate FROM billing.config WHERE key = 'commission_rate';
    v_fee := round(NEW.total * COALESCE(v_rate, 0), 2);
    NEW.fee_amount := v_fee;
    INSERT INTO billing.fee_accruals
      (subject_type, subject_id, kind, amount, currency, community_id, order_id)
      VALUES ('store', NEW.store_id, 'sale', v_fee, NEW.currency, NEW.community_id, NEW.id)
      ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER orders_accrue_sale
BEFORE UPDATE ON orders.orders
FOR EACH ROW
EXECUTE FUNCTION billing.tg_accrue_sale();--> statement-breakpoint

-- Devengo de la comisión de **envío** (S-3): al pasar el envío a `entregado`, se
-- calcula `agreed_price * commission_rate` y se inserta la comisión (sujeto = Mover).
-- Una por envío. SECURITY DEFINER.
CREATE OR REPLACE FUNCTION billing.tg_accrue_shipment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_rate numeric;
  v_fee numeric;
BEGIN
  IF NEW.status = 'entregado' AND OLD.status IS DISTINCT FROM 'entregado'
     AND NEW.mover_id IS NOT NULL THEN
    SELECT value::numeric INTO v_rate FROM billing.config WHERE key = 'commission_rate';
    v_fee := round(COALESCE(NEW.agreed_price, 0) * COALESCE(v_rate, 0), 2);
    INSERT INTO billing.fee_accruals
      (subject_type, subject_id, kind, amount, currency, community_id, shipment_id)
      VALUES ('mover', NEW.mover_id, 'shipment', v_fee, 'USD', NEW.community_id, NEW.id)
      ON CONFLICT (shipment_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER shipments_accrue_shipment
AFTER UPDATE ON shipping.shipments
FOR EACH ROW
EXECUTE FUNCTION billing.tg_accrue_shipment();