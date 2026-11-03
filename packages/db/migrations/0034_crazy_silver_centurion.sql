CREATE SCHEMA "billing";
--> statement-breakpoint
CREATE TABLE "billing"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"price_amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "billing"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text DEFAULT 'trial' NOT NULL,
	"period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_store_unique" UNIQUE("store_id")
);
--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "store"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "billing"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- CHECKs de dominio.
ALTER TABLE billing.plans
  ADD CONSTRAINT plans_code_chk CHECK (code IN ('seller_products','seller_services')),
  ADD CONSTRAINT plans_price_chk CHECK (price_amount >= 0);--> statement-breakpoint
ALTER TABLE billing.subscriptions
  ADD CONSTRAINT subscriptions_status_chk CHECK (status IN ('trial','active','past_due','cancelled'));--> statement-breakpoint

-- RLS + grants. `plans` es referencia de lectura pública. `subscriptions`: la ve el
-- equipo de la tienda o un admin (comunidad/plataforma); la **cambia** solo un admin
-- (el alta `trial` la hace el trigger definer; la app no inserta).
GRANT USAGE ON SCHEMA billing TO app;--> statement-breakpoint
GRANT SELECT ON billing.plans TO app;--> statement-breakpoint
GRANT SELECT, UPDATE ON billing.subscriptions TO app;--> statement-breakpoint
ALTER TABLE billing.plans ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE billing.subscriptions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY plans_select ON billing.plans FOR SELECT USING (true);--> statement-breakpoint
CREATE POLICY subscriptions_select ON billing.subscriptions FOR SELECT USING (
  EXISTS (SELECT 1 FROM store.stores s WHERE s.id = store_id
    AND (authz.is_store_member(s.id, NULL)
         OR authz.is_community_admin(s.community_id)
         OR authz.is_platform_admin()))
);--> statement-breakpoint
CREATE POLICY subscriptions_update ON billing.subscriptions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM store.stores s WHERE s.id = store_id
    AND (authz.is_community_admin(s.community_id) OR authz.is_platform_admin()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM store.stores s WHERE s.id = store_id
    AND (authz.is_community_admin(s.community_id) OR authz.is_platform_admin()))
);--> statement-breakpoint

-- Al crear una tienda, se le da una suscripción `trial` (30 días) con el plan
-- según su `kind`. SECURITY DEFINER (owner): billing "escucha" a store por trigger,
-- sin acoplar store→billing. Si aún no hay plan cargado, no hace nada.
CREATE OR REPLACE FUNCTION billing.tg_create_trial_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_plan uuid;
BEGIN
  SELECT id INTO v_plan FROM billing.plans
    WHERE code = CASE NEW.kind WHEN 'services' THEN 'seller_services'
                               ELSE 'seller_products' END;
  IF v_plan IS NOT NULL THEN
    INSERT INTO billing.subscriptions (store_id, plan_id, status, period_end)
      VALUES (NEW.id, v_plan, 'trial', now() + interval '30 days')
      ON CONFLICT (store_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER stores_trial_subscription
AFTER INSERT ON store.stores
FOR EACH ROW
EXECUTE FUNCTION billing.tg_create_trial_subscription();