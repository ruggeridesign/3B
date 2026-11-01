CREATE TABLE "catalog"."item_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"axis_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_amount" numeric(12, 2),
	"track_stock" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_variants_item_sku_unique" UNIQUE("item_id","sku")
);
--> statement-breakpoint
ALTER TABLE "catalog"."item_variants" ADD CONSTRAINT "item_variants_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "catalog"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_variants_barcode_idx" ON "catalog"."item_variants" USING btree ("barcode");--> statement-breakpoint

-- RLS + grants de item_variants. La visibilidad/gestión se DERIVAN del ítem
-- padre (sin denormalizar): la subconsulta a catalog.items queda sujeta a la RLS
-- de items, así que una variante se ve si su ítem se ve; y se gestiona si sos
-- owner/admin/catalog de la tienda del ítem.
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog.item_variants TO app;--> statement-breakpoint
ALTER TABLE catalog.item_variants ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY variants_select ON catalog.item_variants FOR SELECT USING (
  EXISTS (SELECT 1 FROM catalog.items i WHERE i.id = item_id)
);--> statement-breakpoint
CREATE POLICY variants_insert ON catalog.item_variants FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM catalog.items i
    WHERE i.id = item_id
      AND authz.is_store_member(i.store_id, ARRAY['owner','admin','catalog'])
  )
);--> statement-breakpoint
CREATE POLICY variants_update ON catalog.item_variants FOR UPDATE USING (
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
CREATE POLICY variants_delete ON catalog.item_variants FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM catalog.items i
    WHERE i.id = item_id
      AND authz.is_store_member(i.store_id, ARRAY['owner','admin','catalog'])
  )
);