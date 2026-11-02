CREATE TABLE "inventory"."reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory"."reservations" ADD CONSTRAINT "reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."reservations" ADD CONSTRAINT "reservations_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "catalog"."item_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_order_idx" ON "inventory"."reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "reservations_variant_idx" ON "inventory"."reservations" USING btree ("variant_id");--> statement-breakpoint

-- CHECKs de validez de la reserva.
ALTER TABLE inventory.reservations
  ADD CONSTRAINT reservations_status_chk CHECK (status IN ('active','consumed','released')),
  ADD CONSTRAINT reservations_qty_chk CHECK (qty > 0);--> statement-breakpoint
-- Índice parcial para la expiración automática (lo barrerá el worker más adelante).
CREATE INDEX reservations_expires_active_idx ON inventory.reservations (expires_at)
  WHERE status = 'active';--> statement-breakpoint

-- RLS + grants de reservations. La escribe el módulo inventory; `app` tiene
-- SELECT/INSERT/UPDATE (nunca DELETE: una reserva se libera/consume, no se borra).
-- Visibilidad/escritura: el Maker del pedido o un miembro de la tienda receptora
-- (reservar lo hace el Seller al aceptar; liberar, el Maker al cancelar).
GRANT SELECT, INSERT, UPDATE ON inventory.reservations TO app;--> statement-breakpoint
ALTER TABLE inventory.reservations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY reservations_select ON inventory.reservations FOR SELECT USING (
  EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = order_id
    AND (o.maker_id = authz.current_user_id() OR authz.is_store_member(o.store_id, NULL)))
);--> statement-breakpoint
CREATE POLICY reservations_insert ON inventory.reservations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = order_id
    AND (o.maker_id = authz.current_user_id() OR authz.is_store_member(o.store_id, NULL)))
);--> statement-breakpoint
CREATE POLICY reservations_update ON inventory.reservations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = order_id
    AND (o.maker_id = authz.current_user_id() OR authz.is_store_member(o.store_id, NULL)))
) WITH CHECK (
  EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = order_id
    AND (o.maker_id = authz.current_user_id() OR authz.is_store_member(o.store_id, NULL)))
);--> statement-breakpoint

-- Proyección de la reserva sobre stock_levels.reserved. SECURITY DEFINER (owner):
-- la app no tiene grant de escritura sobre stock_levels. Al crear `active` sube
-- `reserved` SOLO si hay disponible (on_hand - reserved >= qty); si no, aborta la
-- transacción (el servicio pre-chequea para devolver 409 limpio, esto es el candado
-- final ante carreras). Al pasar a `released`/`consumed` devuelve `reserved`; el
-- descuento de `on_hand` (venta) lo hará su propio movimiento de stock en M6.
CREATE OR REPLACE FUNCTION inventory.tg_project_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' THEN
      UPDATE inventory.stock_levels
        SET reserved = reserved + NEW.qty, version = version + 1, updated_at = now()
        WHERE variant_id = NEW.variant_id AND on_hand - reserved >= NEW.qty;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'stock insuficiente para reservar la variante %', NEW.variant_id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'active' AND NEW.status IN ('released','consumed') THEN
      UPDATE inventory.stock_levels
        SET reserved = reserved - OLD.qty, version = version + 1, updated_at = now()
        WHERE variant_id = NEW.variant_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER reservations_project
AFTER INSERT OR UPDATE ON inventory.reservations
FOR EACH ROW
EXECUTE FUNCTION inventory.tg_project_reservation();--> statement-breakpoint

-- Ampliación de orders para la máquina de estados (M5b): el pedido deja de ser
-- libro de solo inserción. `app` suma UPDATE sobre orders.orders (cambiar estado).
-- Puede actualizar el estado el Maker dueño o un miembro de la tienda; la arista
-- válida y el actor correcto los valida la capa de dominio/ruta (defensa en capas).
GRANT UPDATE ON orders.orders TO app;--> statement-breakpoint
CREATE POLICY orders_update ON orders.orders FOR UPDATE USING (
  maker_id = authz.current_user_id() OR authz.is_store_member(store_id, NULL)
) WITH CHECK (
  maker_id = authz.current_user_id() OR authz.is_store_member(store_id, NULL)
);--> statement-breakpoint

-- La bitácora ahora también la escribe la tienda (transiciones del Seller), no solo
-- el Maker al crear. Se reemplaza la policy de INSERT de M5a por una que admite a
-- cualquiera involucrado en el pedido (Maker dueño o miembro de la tienda).
DROP POLICY order_events_insert ON orders.order_events;--> statement-breakpoint
CREATE POLICY order_events_insert ON orders.order_events FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = order_id
    AND (o.maker_id = authz.current_user_id() OR authz.is_store_member(o.store_id, NULL)))
);