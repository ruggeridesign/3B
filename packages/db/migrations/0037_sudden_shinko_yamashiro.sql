ALTER TABLE "payments"."payment_reports" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments"."payment_reports" ADD COLUMN "statement_id" uuid;--> statement-breakpoint
ALTER TABLE "payments"."payment_reports" ADD CONSTRAINT "payment_reports_statement_id_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "billing"."statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_reports_statement_idx" ON "payments"."payment_reports" USING btree ("statement_id");--> statement-breakpoint

-- D-03: referencia polimórfica — exactamente uno de `order_id`/`statement_id`.
ALTER TABLE payments.payment_reports
  ADD CONSTRAINT payment_reports_target_chk CHECK (
    (order_id IS NOT NULL AND statement_id IS NULL)
    OR (order_id IS NULL AND statement_id IS NOT NULL)
  );--> statement-breakpoint

-- RLS del caso **estado de cuenta** (M7c.2). Las policies de pedido (M5c) usan
-- `order_id`; con `order_id` NULL no matchean, así que se suman estas (OR de policies
-- permisivas). El sujeto del estado de cuenta (tienda/Mover) reporta y ve; el admin
-- (de la comunidad del estado de cuenta, o de plataforma) ve y revisa (confirma/rechaza).
CREATE POLICY payment_reports_select_statement ON payments.payment_reports FOR SELECT USING (
  statement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM billing.statements st WHERE st.id = statement_id AND (
      (st.subject_type = 'store' AND authz.is_store_member(st.subject_id, NULL))
      OR (st.subject_type = 'mover' AND st.subject_id = authz.current_user_id())
      OR (st.community_id IS NOT NULL AND authz.is_community_admin(st.community_id))
      OR authz.is_platform_admin()
    )
  )
);--> statement-breakpoint
CREATE POLICY payment_reports_insert_statement ON payments.payment_reports FOR INSERT WITH CHECK (
  statement_id IS NOT NULL
  AND reported_by = authz.current_user_id()
  AND EXISTS (
    SELECT 1 FROM billing.statements st WHERE st.id = statement_id AND (
      (st.subject_type = 'store' AND authz.is_store_member(st.subject_id, NULL))
      OR (st.subject_type = 'mover' AND st.subject_id = authz.current_user_id())
    )
  )
);--> statement-breakpoint
CREATE POLICY payment_reports_update_statement ON payments.payment_reports FOR UPDATE USING (
  statement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM billing.statements st WHERE st.id = statement_id AND (
      (st.community_id IS NOT NULL AND authz.is_community_admin(st.community_id))
      OR authz.is_platform_admin()
    )
  )
) WITH CHECK (
  statement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM billing.statements st WHERE st.id = statement_id AND (
      (st.community_id IS NOT NULL AND authz.is_community_admin(st.community_id))
      OR authz.is_platform_admin()
    )
  )
);--> statement-breakpoint

-- Al **reportar** el pago de un estado de cuenta, este pasa `open→pending`. Billing
-- "escucha" a payments por trigger (SECURITY DEFINER: actualiza `statements` sin dar
-- UPDATE a `app`). Guard: solo filas con `statement_id`.
CREATE OR REPLACE FUNCTION billing.tg_statement_payment_reported()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.statement_id IS NOT NULL THEN
    UPDATE billing.statements
      SET status = 'pending', updated_at = now()
      WHERE id = NEW.statement_id AND status = 'open';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER payment_reports_statement_reported
AFTER INSERT ON payments.payment_reports
FOR EACH ROW
EXECUTE FUNCTION billing.tg_statement_payment_reported();--> statement-breakpoint

-- Al **revisar** el reporte: confirmar → `paid`; rechazar → vuelve a `open` (reintento).
CREATE OR REPLACE FUNCTION billing.tg_statement_payment_reviewed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.statement_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      UPDATE billing.statements
        SET status = 'paid', updated_at = now()
        WHERE id = NEW.statement_id;
    ELSIF NEW.status = 'rejected' THEN
      UPDATE billing.statements
        SET status = 'open', updated_at = now()
        WHERE id = NEW.statement_id AND status = 'pending';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER payment_reports_statement_reviewed
AFTER UPDATE ON payments.payment_reports
FOR EACH ROW
EXECUTE FUNCTION billing.tg_statement_payment_reviewed();