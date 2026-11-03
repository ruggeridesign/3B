ALTER TABLE "shipping"."shipments" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint

-- M6c — progreso del viaje + entrega. El **Mover asignado** también puede actualizar
-- su envío (avanzar el viaje / entregar); se reemplaza la policy de M6b para sumarlo.
DROP POLICY shipments_update ON shipping.shipments;--> statement-breakpoint
CREATE POLICY shipments_update ON shipping.shipments FOR UPDATE USING (
  requester_id = authz.current_user_id()
  OR mover_id = authz.current_user_id()
  OR (store_id IS NOT NULL AND authz.is_store_member(store_id, NULL))
) WITH CHECK (
  requester_id = authz.current_user_id()
  OR mover_id = authz.current_user_id()
  OR (store_id IS NOT NULL AND authz.is_store_member(store_id, NULL))
);--> statement-breakpoint

-- Al **entregar** (envío → `entregado`): se **consume** el stock reservado del
-- pedido (reservas `active`→`consumed` —el trigger devuelve `reserved`— + un
-- movimiento `sale` que descuenta `on_hand`) y el pedido pasa `en_envio→entregado`
-- con su evento. SECURITY DEFINER (owner): es una acción de sistema que cruza
-- shipping→inventory→orders; el Mover no tiene esos permisos bajo RLS. Idempotente
-- por el único de `idempotency_key` del movimiento y por el guard de estado.
CREATE OR REPLACE FUNCTION shipping.tg_shipment_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.status = 'entregado' AND OLD.status <> 'entregado'
     AND NEW.order_id IS NOT NULL THEN
    -- Consumir el stock reservado (venta real).
    FOR r IN SELECT id, variant_id, qty FROM inventory.reservations
             WHERE order_id = NEW.order_id AND status = 'active' LOOP
      UPDATE inventory.reservations
        SET status = 'consumed', updated_at = now() WHERE id = r.id;
      INSERT INTO inventory.stock_movements
        (variant_id, kind, channel, qty, reference, idempotency_key, created_by)
        VALUES (r.variant_id, 'sale', 'system', -r.qty, 'venta por entrega',
                'consume-' || r.id::text, NEW.mover_id);
    END LOOP;
    -- Mover el pedido en_envio→entregado (arista system) + bitácora.
    UPDATE orders.orders SET status = 'entregado', updated_at = now()
      WHERE id = NEW.order_id AND status = 'en_envio';
    IF FOUND THEN
      INSERT INTO orders.order_events (order_id, from_status, to_status, actor_id, reason)
        VALUES (NEW.order_id, 'en_envio', 'entregado', NEW.mover_id,
                'Entregado (PIN validado).');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER shipments_delivered
AFTER UPDATE ON shipping.shipments
FOR EACH ROW
EXECUTE FUNCTION shipping.tg_shipment_delivered();