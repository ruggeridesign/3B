CREATE SCHEMA "catalog";
--> statement-breakpoint
CREATE TABLE "catalog"."items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price_amount" numeric(12, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"price_mode" text DEFAULT 'fixed' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_store_slug_unique" UNIQUE("store_id","slug")
);
--> statement-breakpoint
ALTER TABLE "catalog"."items" ADD CONSTRAINT "items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "store"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."items" ADD CONSTRAINT "items_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "community"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_community_status_idx" ON "catalog"."items" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "items_store_idx" ON "catalog"."items" USING btree ("store_id");--> statement-breakpoint

-- Denormaliza community_id desde la tienda (D-05). BEFORE INSERT para que el
-- valor exista antes del NOT NULL y del WITH CHECK; SECURITY DEFINER para leer
-- store.stores sin depender de la RLS. El cliente NO puede fijar la comunidad.
CREATE OR REPLACE FUNCTION catalog.tg_set_item_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  SELECT s.community_id INTO NEW.community_id
  FROM store.stores s WHERE s.id = NEW.store_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS items_set_community ON catalog.items;--> statement-breakpoint
CREATE TRIGGER items_set_community BEFORE INSERT ON catalog.items
FOR EACH ROW EXECUTE FUNCTION catalog.tg_set_item_community();--> statement-breakpoint

-- RLS + grants de catalog.items (patrón de 0001). Ver: miembros de la tienda ven
-- todo (incluye borradores); afuera, solo ítems publicados en comunidad visible.
-- Gestionar (insert/update/delete): owner/admin/catalog — estrena el rol catalog.
GRANT USAGE ON SCHEMA catalog TO app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog.items TO app;--> statement-breakpoint
ALTER TABLE catalog.items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY items_select ON catalog.items FOR SELECT USING (
  authz.is_platform_admin()
  OR authz.is_store_member(store_id, NULL)
  OR (status = 'published' AND authz.can_see_community(community_id))
);--> statement-breakpoint
CREATE POLICY items_insert ON catalog.items FOR INSERT WITH CHECK (
  authz.is_platform_admin()
  OR authz.is_store_member(store_id, ARRAY['owner','admin','catalog'])
);--> statement-breakpoint
CREATE POLICY items_update ON catalog.items FOR UPDATE USING (
  authz.is_platform_admin()
  OR authz.is_store_member(store_id, ARRAY['owner','admin','catalog'])
) WITH CHECK (
  authz.is_platform_admin()
  OR authz.is_store_member(store_id, ARRAY['owner','admin','catalog'])
);--> statement-breakpoint
CREATE POLICY items_delete ON catalog.items FOR DELETE USING (
  authz.is_platform_admin()
  OR authz.is_store_member(store_id, ARRAY['owner','admin','catalog'])
);