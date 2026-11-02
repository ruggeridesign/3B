CREATE INDEX "payment_reports_proof_idx" ON "payments"."payment_reports" USING btree ("proof_media_id");--> statement-breakpoint

-- Captura del pago (M5c.2): la media adjunta como comprobante (`proof_media_id`)
-- se vuelve visible para los participantes del pedido, no solo para quien la
-- subió. Policy permissive (OR con la RLS por `created_by`): así el Seller ve la
-- captura del comprador sin acoplar media→payments/orders en el código (mismo
-- patrón que `media_select_item` de M4 o la visibilidad de KYC).
CREATE POLICY media_select_payment_proof ON media.media FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM payments.payment_reports pr
    JOIN orders.orders o ON o.id = pr.order_id
    WHERE pr.proof_media_id = media.id
      AND (o.maker_id = authz.current_user_id()
           OR authz.is_store_member(o.store_id, NULL))
  )
);