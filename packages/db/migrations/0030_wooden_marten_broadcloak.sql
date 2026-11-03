CREATE SCHEMA "shipping";
--> statement-breakpoint
CREATE TABLE "shipping"."shipment_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"mover_id" uuid NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"eta_min" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_offers_shipment_mover_unique" UNIQUE("shipment_id","mover_id")
);
--> statement-breakpoint
CREATE TABLE "shipping"."shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"requester_id" uuid NOT NULL,
	"mover_id" uuid,
	"community_id" uuid NOT NULL,
	"store_id" uuid,
	"status" text DEFAULT 'solicitado' NOT NULL,
	"package_note" text,
	"origin_ref" text,
	"dest_ref" text,
	"agreed_price" numeric(12, 2),
	"pin_hash" text,
	"proof_media_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity"."mover_profiles" ADD COLUMN "operating_communities" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping"."shipment_offers" ADD CONSTRAINT "shipment_offers_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "shipping"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping"."shipment_offers" ADD CONSTRAINT "shipment_offers_mover_id_mover_profiles_user_id_fk" FOREIGN KEY ("mover_id") REFERENCES "identity"."mover_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping"."shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping"."shipments" ADD CONSTRAINT "shipments_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping"."shipments" ADD CONSTRAINT "shipments_mover_id_mover_profiles_user_id_fk" FOREIGN KEY ("mover_id") REFERENCES "identity"."mover_profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping"."shipments" ADD CONSTRAINT "shipments_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "community"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping"."shipments" ADD CONSTRAINT "shipments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "store"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping"."shipments" ADD CONSTRAINT "shipments_proof_media_id_media_id_fk" FOREIGN KEY ("proof_media_id") REFERENCES "media"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_offers_shipment_idx" ON "shipping"."shipment_offers" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipping"."shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shipments_community_idx" ON "shipping"."shipments" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "shipments_mover_idx" ON "shipping"."shipments" USING btree ("mover_id");--> statement-breakpoint

-- CHECKs de dominio (estados válidos y montos no negativos).
ALTER TABLE shipping.shipments
  ADD CONSTRAINT shipments_status_chk CHECK (status IN (
    'solicitado','ofertado','asignado','hacia_retiro','retirado',
    'en_transito','entregado','cancelado','fallido')),
  ADD CONSTRAINT shipments_price_chk CHECK (agreed_price IS NULL OR agreed_price >= 0);--> statement-breakpoint
ALTER TABLE shipping.shipment_offers
  ADD CONSTRAINT shipment_offers_status_chk CHECK (status IN ('active','accepted','rejected','expired')),
  ADD CONSTRAINT shipment_offers_price_chk CHECK (price >= 0),
  ADD CONSTRAINT shipment_offers_eta_chk CHECK (eta_min > 0);--> statement-breakpoint
-- Índice parcial para vencer ofertas (S-1, lo barrerá el worker más adelante).
CREATE INDEX shipment_offers_expires_active_idx ON shipping.shipment_offers (expires_at)
  WHERE status = 'active';--> statement-breakpoint

-- RLS + grants. Esquema nuevo: USAGE al rol `app`. En M6a el envío es casi de solo
-- inserción: `app` tiene SELECT/INSERT (no UPDATE; la asignación llega en M6b y el
-- paso a `ofertado` lo hace un trigger definer, no el cliente).
GRANT USAGE ON SCHEMA shipping TO app;--> statement-breakpoint
GRANT SELECT, INSERT ON shipping.shipments TO app;--> statement-breakpoint
GRANT SELECT, INSERT ON shipping.shipment_offers TO app;--> statement-breakpoint
ALTER TABLE shipping.shipments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE shipping.shipment_offers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Visibilidad del envío: solicitante, Mover asignado, la tienda, o un Mover
-- aprobado que opera en la comunidad (para poder ofertar). Alta: el solicitante,
-- miembro de la tienda del pedido, en una comunidad que pueda ver.
CREATE POLICY shipments_select ON shipping.shipments FOR SELECT USING (
  requester_id = authz.current_user_id()
  OR mover_id = authz.current_user_id()
  OR (store_id IS NOT NULL AND authz.is_store_member(store_id, NULL))
  OR (order_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM orders.orders o
       WHERE o.id = order_id AND o.maker_id = authz.current_user_id()))
  OR EXISTS (SELECT 1 FROM identity.mover_profiles mp
       WHERE mp.user_id = authz.current_user_id()
         AND mp.status = 'approved'
         AND community_id = ANY(mp.operating_communities))
);--> statement-breakpoint
CREATE POLICY shipments_insert ON shipping.shipments FOR INSERT WITH CHECK (
  requester_id = authz.current_user_id()
  AND authz.can_see_community(community_id)
  AND (store_id IS NULL OR authz.is_store_member(store_id, NULL))
);--> statement-breakpoint

-- Ofertas: las ve el Mover que la hizo y el solicitante/tienda del envío. Las crea
-- un Mover aprobado que opera en la comunidad del envío (envío aún abierto).
CREATE POLICY shipment_offers_select ON shipping.shipment_offers FOR SELECT USING (
  mover_id = authz.current_user_id()
  OR EXISTS (SELECT 1 FROM shipping.shipments s WHERE s.id = shipment_id
       AND (s.requester_id = authz.current_user_id()
            OR (s.store_id IS NOT NULL AND authz.is_store_member(s.store_id, NULL))))
);--> statement-breakpoint
CREATE POLICY shipment_offers_insert ON shipping.shipment_offers FOR INSERT WITH CHECK (
  mover_id = authz.current_user_id()
  AND EXISTS (SELECT 1 FROM shipping.shipments s
       JOIN identity.mover_profiles mp ON mp.user_id = authz.current_user_id()
       WHERE s.id = shipment_id
         AND s.status IN ('solicitado','ofertado')
         AND mp.status = 'approved'
         AND s.community_id = ANY(mp.operating_communities))
);--> statement-breakpoint

-- Al llegar la PRIMERA oferta, el envío pasa a `ofertado`. SECURITY DEFINER (owner):
-- `app` no tiene UPDATE sobre shipments, así que lo hace el trigger (no el Mover).
CREATE OR REPLACE FUNCTION shipping.tg_shipment_offered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE shipping.shipments
    SET status = 'ofertado', updated_at = now()
    WHERE id = NEW.shipment_id AND status = 'solicitado';
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER shipment_offers_offered
AFTER INSERT ON shipping.shipment_offers
FOR EACH ROW
EXECUTE FUNCTION shipping.tg_shipment_offered();