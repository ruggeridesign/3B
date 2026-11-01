CREATE TABLE "store"."store_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"opens_min" integer NOT NULL,
	"closes_min" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_hours_unique_interval" UNIQUE("store_id","weekday","opens_min")
);
--> statement-breakpoint
ALTER TABLE "store"."store_hours" ADD CONSTRAINT "store_hours_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "store"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_hours_store_idx" ON "store"."store_hours" USING btree ("store_id");--> statement-breakpoint

-- CHECKs de validez: día 0..6, minutos en rango y cierre posterior a apertura.
ALTER TABLE store.store_hours
  ADD CONSTRAINT store_hours_weekday_chk CHECK (weekday BETWEEN 0 AND 6),
  ADD CONSTRAINT store_hours_opens_chk CHECK (opens_min BETWEEN 0 AND 1440),
  ADD CONSTRAINT store_hours_closes_chk CHECK (closes_min BETWEEN 0 AND 1440),
  ADD CONSTRAINT store_hours_range_chk CHECK (closes_min > opens_min);--> statement-breakpoint

-- RLS + grants. La visibilidad se DERIVA del store padre (como item_variants del
-- ítem): la subconsulta a store.stores queda sujeta a stores_select, así que un
-- horario se ve si se ve la tienda (público a la comunidad). Gestionar (crear/
-- borrar) = owner/admin de la tienda.
GRANT SELECT, INSERT, UPDATE, DELETE ON store.store_hours TO app;--> statement-breakpoint
ALTER TABLE store.store_hours ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY store_hours_select ON store.store_hours FOR SELECT USING (
  EXISTS (SELECT 1 FROM store.stores s WHERE s.id = store_id)
);--> statement-breakpoint
CREATE POLICY store_hours_insert ON store.store_hours FOR INSERT WITH CHECK (
  authz.is_platform_admin() OR authz.is_store_member(store_id, ARRAY['owner','admin'])
);--> statement-breakpoint
CREATE POLICY store_hours_update ON store.store_hours FOR UPDATE USING (
  authz.is_platform_admin() OR authz.is_store_member(store_id, ARRAY['owner','admin'])
) WITH CHECK (
  authz.is_platform_admin() OR authz.is_store_member(store_id, ARRAY['owner','admin'])
);--> statement-breakpoint
CREATE POLICY store_hours_delete ON store.store_hours FOR DELETE USING (
  authz.is_platform_admin() OR authz.is_store_member(store_id, ARRAY['owner','admin'])
);