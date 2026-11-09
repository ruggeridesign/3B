-- M8d.2a — emisión de eventos de notificación al outbox por TRIGGER.
-- `order.placed`: al crear un pedido, se emite un evento al `platform.outbox` para
-- que el worker notifique (push) a los miembros de la tienda. SECURITY DEFINER:
-- corre como owner, así puede escribir en el outbox aunque quien inserta el pedido
-- sea el rol `app` (que no tiene grants sobre `platform.outbox`). El worker resuelve
-- los destinatarios y compone el texto (TS); el trigger solo emite los IDs.

CREATE OR REPLACE FUNCTION platform.emit_order_placed()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO platform.outbox (topic, payload)
  VALUES (
    'order.placed',
    jsonb_build_object(
      'orderId', NEW.id,
      'storeId', NEW.store_id,
      'buyerId', NEW.maker_id,
      'number', NEW.number
    )
  );
  RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS order_placed_emit ON orders.orders;--> statement-breakpoint
CREATE TRIGGER order_placed_emit
  AFTER INSERT ON orders.orders
  FOR EACH ROW
  EXECUTE FUNCTION platform.emit_order_placed();
