CREATE TABLE "catalog"."collection_items" (
	"collection_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_collection_id_item_id_pk" PRIMARY KEY("collection_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_store_title_unique" UNIQUE("store_id","title")
);
--> statement-breakpoint
ALTER TABLE "catalog"."collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "catalog"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."collection_items" ADD CONSTRAINT "collection_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "catalog"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."collections" ADD CONSTRAINT "collections_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "store"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_items_item_idx" ON "catalog"."collection_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "collections_store_idx" ON "catalog"."collections" USING btree ("store_id");--> statement-breakpoint

-- RLS + grants de collections. Visibilidad DERIVADA del store (como store_hours):
-- la subconsulta a store.stores queda sujeta a stores_select, así que una colección
-- se ve si se ve la tienda (pública a la comunidad). Gestionar = owner/admin/catalog.
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog.collections TO app;--> statement-breakpoint
ALTER TABLE catalog.collections ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY collections_select ON catalog.collections FOR SELECT USING (
  EXISTS (SELECT 1 FROM store.stores s WHERE s.id = store_id)
);--> statement-breakpoint
CREATE POLICY collections_insert ON catalog.collections FOR INSERT WITH CHECK (
  authz.is_store_member(store_id, ARRAY['owner','admin','catalog'])
);--> statement-breakpoint
CREATE POLICY collections_update ON catalog.collections FOR UPDATE USING (
  authz.is_store_member(store_id, ARRAY['owner','admin','catalog'])
) WITH CHECK (
  authz.is_store_member(store_id, ARRAY['owner','admin','catalog'])
);--> statement-breakpoint
CREATE POLICY collections_delete ON catalog.collections FOR DELETE USING (
  authz.is_store_member(store_id, ARRAY['owner','admin','catalog'])
);--> statement-breakpoint

-- RLS + grants de collection_items. Se DERIVA de la colección padre (como las
-- variantes del ítem): se ve si se ve la colección; se gestiona si gestionás el
-- catálogo de la tienda de esa colección.
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog.collection_items TO app;--> statement-breakpoint
ALTER TABLE catalog.collection_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Una pertenencia se ve si se ve SU colección Y SU ítem: así la vitrina para el
-- comprador no filtra ítems en borrador (ambas subconsultas quedan sujetas a sus
-- propias RLS).
CREATE POLICY collection_items_select ON catalog.collection_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM catalog.collections c WHERE c.id = collection_id)
  AND EXISTS (SELECT 1 FROM catalog.items i WHERE i.id = item_id)
);--> statement-breakpoint
CREATE POLICY collection_items_insert ON catalog.collection_items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM catalog.collections c
    WHERE c.id = collection_id
      AND authz.is_store_member(c.store_id, ARRAY['owner','admin','catalog'])
  )
);--> statement-breakpoint
CREATE POLICY collection_items_update ON catalog.collection_items FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM catalog.collections c
    WHERE c.id = collection_id
      AND authz.is_store_member(c.store_id, ARRAY['owner','admin','catalog'])
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM catalog.collections c
    WHERE c.id = collection_id
      AND authz.is_store_member(c.store_id, ARRAY['owner','admin','catalog'])
  )
);--> statement-breakpoint
CREATE POLICY collection_items_delete ON catalog.collection_items FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM catalog.collections c
    WHERE c.id = collection_id
      AND authz.is_store_member(c.store_id, ARRAY['owner','admin','catalog'])
  )
);