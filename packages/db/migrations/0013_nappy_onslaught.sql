CREATE TABLE "catalog"."service_details" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"duration_min" integer,
	"modality" text DEFAULT 'in_store' NOT NULL,
	"coverage_km" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog"."service_details" ADD CONSTRAINT "service_details_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "catalog"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- RLS + grants de service_details. Igual que item_variants: la visibilidad y la
-- gestión se DERIVAN del ítem padre (sin denormalizar store_id). La subconsulta a
-- catalog.items queda sujeta a la RLS de items, así que el detalle se ve si su
-- ítem se ve; y se gestiona si sos owner/admin/catalog de la tienda del ítem.
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog.service_details TO app;--> statement-breakpoint
ALTER TABLE catalog.service_details ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY service_details_select ON catalog.service_details FOR SELECT USING (
  EXISTS (SELECT 1 FROM catalog.items i WHERE i.id = item_id)
);--> statement-breakpoint
CREATE POLICY service_details_insert ON catalog.service_details FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM catalog.items i
    WHERE i.id = item_id
      AND authz.is_store_member(i.store_id, ARRAY['owner','admin','catalog'])
  )
);--> statement-breakpoint
CREATE POLICY service_details_update ON catalog.service_details FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM catalog.items i
    WHERE i.id = item_id
      AND authz.is_store_member(i.store_id, ARRAY['owner','admin','catalog'])
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM catalog.items i
    WHERE i.id = item_id
      AND authz.is_store_member(i.store_id, ARRAY['owner','admin','catalog'])
  )
);--> statement-breakpoint
CREATE POLICY service_details_delete ON catalog.service_details FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM catalog.items i
    WHERE i.id = item_id
      AND authz.is_store_member(i.store_id, ARRAY['owner','admin','catalog'])
  )
);