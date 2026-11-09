-- M8d.2b — más eventos de notificación al outbox por TRIGGER (SECURITY DEFINER).
-- Patrón de 0041: el trigger emite solo los IDs; el worker resuelve destinatarios y
-- compone el texto (TS). Diseño anti-duplicado: el pedido pasa a `en_envio`/`entregado`
-- por los MISMOS hechos que disparan `shipment.assigned`/`shipment.delivered`, así que
-- `order.status_changed` EXCLUYE esos estados (los cubren los triggers de envío).

-- (1) Estado de pedido → comprador. Solo estados relevantes y NO disparados por el
-- comprador (aceptar/rechazar, confirmar/rechazar pago, listo).
CREATE OR REPLACE FUNCTION platform.emit_order_status_changed()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO platform.outbox (topic, payload)
  VALUES (
    'order.status_changed',
    jsonb_build_object(
      'orderId', NEW.id,
      'buyerId', NEW.maker_id,
      'number', NEW.number,
      'status', NEW.status
    )
  );
  RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS order_status_changed_emit ON orders.orders;--> statement-breakpoint
CREATE TRIGGER order_status_changed_emit
  AFTER UPDATE OF status ON orders.orders
  FOR EACH ROW
  WHEN (
    NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status IN ('aceptado', 'rechazado', 'pago_confirmado', 'pago_rechazado', 'listo')
  )
  EXECUTE FUNCTION platform.emit_order_status_changed();--> statement-breakpoint

-- (2) Envío → Mover (asignado) y comprador (asignado + entregado).
CREATE OR REPLACE FUNCTION platform.emit_shipment_status()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'asignado' THEN
    INSERT INTO platform.outbox (topic, payload)
    VALUES (
      'shipment.assigned',
      jsonb_build_object('shipmentId', NEW.id, 'moverId', NEW.mover_id, 'orderId', NEW.order_id)
    );
  ELSIF NEW.status = 'entregado' THEN
    INSERT INTO platform.outbox (topic, payload)
    VALUES (
      'shipment.delivered',
      jsonb_build_object('shipmentId', NEW.id, 'orderId', NEW.order_id)
    );
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS shipment_status_emit ON shipping.shipments;--> statement-breakpoint
CREATE TRIGGER shipment_status_emit
  AFTER UPDATE OF status ON shipping.shipments
  FOR EACH ROW
  WHEN (
    NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status IN ('asignado', 'entregado')
  )
  EXECUTE FUNCTION platform.emit_shipment_status();--> statement-breakpoint

-- (3) Mensaje de chat → contraparte (el worker excluye al remitente).
CREATE OR REPLACE FUNCTION platform.emit_message_created()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO platform.outbox (topic, payload)
  VALUES (
    'message.created',
    jsonb_build_object(
      'messageId', NEW.id,
      'conversationId', NEW.conversation_id,
      'senderId', NEW.sender_id
    )
  );
  RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS message_created_emit ON messaging.messages;--> statement-breakpoint
CREATE TRIGGER message_created_emit
  AFTER INSERT ON messaging.messages
  FOR EACH ROW
  EXECUTE FUNCTION platform.emit_message_created();
