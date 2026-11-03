CREATE INDEX "shipments_order_idx" ON "shipping"."shipments" USING btree ("order_id");--> statement-breakpoint

-- M6b — asignación + PIN. `app` suma UPDATE sobre shipments (asignar: estado +
-- Mover + precio + pin_hash) y sobre shipment_offers (aceptar/rechazar). Lo hace el
-- solicitante o un miembro de la tienda del envío (la RLS es el candado). El paso de
-- `orders` `listo→en_envio` lo dispara el módulo shipping vía la API de orders.
GRANT UPDATE ON shipping.shipments TO app;--> statement-breakpoint
CREATE POLICY shipments_update ON shipping.shipments FOR UPDATE USING (
  requester_id = authz.current_user_id()
  OR (store_id IS NOT NULL AND authz.is_store_member(store_id, NULL))
) WITH CHECK (
  requester_id = authz.current_user_id()
  OR (store_id IS NOT NULL AND authz.is_store_member(store_id, NULL))
);--> statement-breakpoint
GRANT UPDATE ON shipping.shipment_offers TO app;--> statement-breakpoint
CREATE POLICY shipment_offers_update ON shipping.shipment_offers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM shipping.shipments s WHERE s.id = shipment_id
    AND (s.requester_id = authz.current_user_id()
         OR (s.store_id IS NOT NULL AND authz.is_store_member(s.store_id, NULL))))
) WITH CHECK (
  EXISTS (SELECT 1 FROM shipping.shipments s WHERE s.id = shipment_id
    AND (s.requester_id = authz.current_user_id()
         OR (s.store_id IS NOT NULL AND authz.is_store_member(s.store_id, NULL))))
);