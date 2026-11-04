CREATE TABLE "billing"."statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"period" text NOT NULL,
	"subscription_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"commission_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"community_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statements_subject_period_unique" UNIQUE("subject_type","subject_id","period")
);
--> statement-breakpoint
ALTER TABLE "billing"."statements" ADD CONSTRAINT "statements_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "community"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "statements_subject_idx" ON "billing"."statements" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "statements_community_idx" ON "billing"."statements" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "statements_status_idx" ON "billing"."statements" USING btree ("status");--> statement-breakpoint

-- CHECKs de dominio.
ALTER TABLE billing.statements
  ADD CONSTRAINT statements_subject_chk CHECK (subject_type IN ('store','mover')),
  ADD CONSTRAINT statements_status_chk CHECK (status IN ('open','pending','paid')),
  ADD CONSTRAINT statements_period_chk CHECK (period ~ '^\d{4}-\d{2}$'),
  ADD CONSTRAINT statements_amounts_chk CHECK (
    subscription_amount >= 0 AND commission_amount >= 0 AND total >= 0
  );--> statement-breakpoint

-- RLS + grants. `statements` es solo lectura para la app (la escribe el job del
-- worker como owner); la ve el sujeto (tienda/Mover) o un admin de su comunidad/
-- plataforma. Los estados de cuenta de Movers tienen `community_id` NULL (billing de
-- plataforma): solo los ve el propio Mover o un admin de plataforma.
GRANT SELECT ON billing.statements TO app;--> statement-breakpoint
ALTER TABLE billing.statements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY statements_select ON billing.statements FOR SELECT USING (
  (subject_type = 'store' AND authz.is_store_member(subject_id, NULL))
  OR (subject_type = 'mover' AND subject_id = authz.current_user_id())
  OR (community_id IS NOT NULL AND authz.is_community_admin(community_id))
  OR authz.is_platform_admin()
);--> statement-breakpoint

-- Generación de estados de cuenta de un período (`YYYY-MM`). Job de sistema (lo corre
-- el worker con la conexión owner). SECURITY DEFINER para agregar sin RLS; se revoca a
-- PUBLIC (solo el owner lo invoca). Para cada sujeto con suscripción cobrable o
-- comisiones del mes, hace **upsert** del estado de cuenta (suscripción + comisiones).
-- El upsert solo pisa filas `open` (no toca las ya `pending`/`paid`). Devuelve cuántos
-- sujetos procesó. Idempotente: re-ejecutar refresca los `open` del período.
CREATE OR REPLACE FUNCTION billing.generate_statements(p_period text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_count integer := 0;
  r record;
  v_sub numeric;
  v_comm numeric;
  v_total numeric;
BEGIN
  IF p_period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'period inválido: % (se espera YYYY-MM)', p_period;
  END IF;
  v_start := to_timestamp(p_period || '-01', 'YYYY-MM-DD');
  v_end := v_start + interval '1 month';

  -- Tiendas: con suscripción cobrable (active/past_due) o con comisiones en el mes.
  FOR r IN
    SELECT s.id AS store_id, s.community_id
    FROM store.stores s
    WHERE EXISTS (
            SELECT 1 FROM billing.subscriptions sub
            WHERE sub.store_id = s.id AND sub.status IN ('active','past_due'))
       OR EXISTS (
            SELECT 1 FROM billing.fee_accruals f
            WHERE f.subject_type = 'store' AND f.subject_id = s.id
              AND f.accrued_at >= v_start AND f.accrued_at < v_end)
  LOOP
    SELECT COALESCE(p.price_amount, 0) INTO v_sub
      FROM billing.subscriptions sub
      JOIN billing.plans p ON p.id = sub.plan_id
      WHERE sub.store_id = r.store_id AND sub.status IN ('active','past_due');
    v_sub := COALESCE(v_sub, 0);

    SELECT COALESCE(SUM(amount), 0) INTO v_comm
      FROM billing.fee_accruals
      WHERE subject_type = 'store' AND subject_id = r.store_id
        AND accrued_at >= v_start AND accrued_at < v_end;

    v_total := v_sub + v_comm;
    IF v_total > 0 THEN
      INSERT INTO billing.statements
        (subject_type, subject_id, period, subscription_amount,
         commission_amount, total, currency, status, community_id)
        VALUES ('store', r.store_id, p_period, v_sub, v_comm, v_total,
                'USD', 'open', r.community_id)
      ON CONFLICT (subject_type, subject_id, period) DO UPDATE
        SET subscription_amount = EXCLUDED.subscription_amount,
            commission_amount = EXCLUDED.commission_amount,
            total = EXCLUDED.total,
            community_id = EXCLUDED.community_id,
            updated_at = now()
        WHERE billing.statements.status = 'open';
      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- Movers: con comisiones de envío en el mes (sin suscripción; community_id NULL).
  FOR r IN
    SELECT DISTINCT f.subject_id AS mover_id
    FROM billing.fee_accruals f
    WHERE f.subject_type = 'mover'
      AND f.accrued_at >= v_start AND f.accrued_at < v_end
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_comm
      FROM billing.fee_accruals
      WHERE subject_type = 'mover' AND subject_id = r.mover_id
        AND accrued_at >= v_start AND accrued_at < v_end;

    IF v_comm > 0 THEN
      INSERT INTO billing.statements
        (subject_type, subject_id, period, subscription_amount,
         commission_amount, total, currency, status, community_id)
        VALUES ('mover', r.mover_id, p_period, 0, v_comm, v_comm,
                'USD', 'open', NULL)
      ON CONFLICT (subject_type, subject_id, period) DO UPDATE
        SET commission_amount = EXCLUDED.commission_amount,
            total = EXCLUDED.total,
            updated_at = now()
        WHERE billing.statements.status = 'open';
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION billing.generate_statements(text) FROM PUBLIC;