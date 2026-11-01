CREATE TABLE "catalog"."item_attr_index" (
	"item_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value_text" text,
	"value_num" double precision,
	CONSTRAINT "item_attr_index_item_id_key_pk" PRIMARY KEY("item_id","key")
);
--> statement-breakpoint
ALTER TABLE "catalog"."item_attr_index" ADD CONSTRAINT "item_attr_index_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "catalog"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_attr_idx_key_text" ON "catalog"."item_attr_index" USING btree ("key","value_text");--> statement-breakpoint
CREATE INDEX "item_attr_idx_key_num" ON "catalog"."item_attr_index" USING btree ("key","value_num");--> statement-breakpoint

-- Solo lectura para la app: la proyección la mantiene el trigger (definer).
GRANT SELECT ON catalog.item_attr_index TO app;--> statement-breakpoint
ALTER TABLE catalog.item_attr_index ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Se ve si se ve su ítem (la subconsulta queda sujeta a la RLS de items).
CREATE POLICY item_attr_index_select ON catalog.item_attr_index FOR SELECT USING (
  EXISTS (SELECT 1 FROM catalog.items i WHERE i.id = item_id)
);--> statement-breakpoint

-- Reindexa los valores de atributo del ítem desde `items.attributes`. `value_text`
-- = representación escalar (sin comillas) para cualquier tipo; `value_num` solo si
-- es número (para rangos). SECURITY DEFINER porque la app no escribe la proyección.
CREATE OR REPLACE FUNCTION catalog.tg_reindex_item_attrs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  DELETE FROM catalog.item_attr_index WHERE item_id = NEW.id;
  INSERT INTO catalog.item_attr_index (item_id, key, value_text, value_num)
  SELECT NEW.id, kv.key,
         kv.value #>> '{}',
         CASE WHEN jsonb_typeof(kv.value) = 'number'
              THEN (kv.value #>> '{}')::double precision ELSE NULL END
  FROM jsonb_each(NEW.attributes) AS kv;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER items_reindex_attrs
AFTER INSERT OR UPDATE OF attributes ON catalog.items
FOR EACH ROW
EXECUTE FUNCTION catalog.tg_reindex_item_attrs();--> statement-breakpoint

-- Backfill de los ítems ya existentes (el trigger solo cubre inserts/updates
-- futuros). Reusa la misma proyección.
INSERT INTO catalog.item_attr_index (item_id, key, value_text, value_num)
SELECT i.id, kv.key,
       kv.value #>> '{}',
       CASE WHEN jsonb_typeof(kv.value) = 'number'
            THEN (kv.value #>> '{}')::double precision ELSE NULL END
FROM catalog.items i, jsonb_each(i.attributes) AS kv
ON CONFLICT (item_id, key) DO NOTHING;