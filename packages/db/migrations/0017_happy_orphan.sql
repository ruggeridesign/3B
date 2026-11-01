CREATE SCHEMA "inventory";
--> statement-breakpoint
CREATE TABLE "inventory"."stock_levels" (
	"variant_id" uuid PRIMARY KEY NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"low_threshold" integer,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory"."stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"channel" text DEFAULT 'counter' NOT NULL,
	"qty" integer NOT NULL,
	"reference" text,
	"idempotency_key" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory"."stock_levels" ADD CONSTRAINT "stock_levels_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "catalog"."item_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory"."stock_movements" ADD CONSTRAINT "stock_movements_variant_id_item_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "catalog"."item_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_variant_idx" ON "inventory"."stock_movements" USING btree ("variant_id","created_at");--> statement-breakpoint

-- CHECKs de validez. El `on_hand >= 0` es el candado final del no-sobreventa
-- (lo chequea el trigger al proyectar); el servicio ya rechaza antes con 409.
ALTER TABLE inventory.stock_levels
  ADD CONSTRAINT stock_levels_on_hand_chk CHECK (on_hand >= 0),
  ADD CONSTRAINT stock_levels_reserved_chk CHECK (reserved >= 0);--> statement-breakpoint
ALTER TABLE inventory.stock_movements
  ADD CONSTRAINT stock_mov_kind_chk CHECK (kind IN ('receipt','sale','adjustment','return')),
  ADD CONSTRAINT stock_mov_channel_chk CHECK (channel IN ('online','counter','system')),
  ADD CONSTRAINT stock_mov_qty_chk CHECK (qty <> 0);--> statement-breakpoint
-- Idempotencia: una misma clave no aplica dos veces (el servicio además la reusa).
CREATE UNIQUE INDEX stock_movements_idem_unique ON inventory.stock_movements (idempotency_key)
  WHERE idempotency_key IS NOT NULL;--> statement-breakpoint

-- RLS + grants. Esquema nuevo: USAGE al rol `app`. Visibilidad DERIVADA de la
-- variante→ítem→tienda: la ve cualquier miembro de la tienda. `stock_levels` es
-- de SOLO LECTURA para la app (la escribe el trigger, definer); `stock_movements`
-- es libro de solo inserción (gestión = owner/admin/catalog).
GRANT USAGE ON SCHEMA inventory TO app;--> statement-breakpoint
GRANT SELECT ON inventory.stock_levels TO app;--> statement-breakpoint
GRANT SELECT, INSERT ON inventory.stock_movements TO app;--> statement-breakpoint
ALTER TABLE inventory.stock_levels ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE inventory.stock_movements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY stock_levels_select ON inventory.stock_levels FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM catalog.item_variants v
    JOIN catalog.items i ON i.id = v.item_id
    WHERE v.id = variant_id AND authz.is_store_member(i.store_id, NULL)
  )
);--> statement-breakpoint
CREATE POLICY stock_movements_select ON inventory.stock_movements FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM catalog.item_variants v
    JOIN catalog.items i ON i.id = v.item_id
    WHERE v.id = variant_id AND authz.is_store_member(i.store_id, NULL)
  )
);--> statement-breakpoint
CREATE POLICY stock_movements_insert ON inventory.stock_movements FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM catalog.item_variants v
    JOIN catalog.items i ON i.id = v.item_id
    WHERE v.id = variant_id
      AND authz.is_store_member(i.store_id, ARRAY['owner','admin','catalog'])
  )
);--> statement-breakpoint

-- Proyección del libro: cada movimiento ajusta `on_hand` de la variante. El
-- trigger es SECURITY DEFINER (owner, bypassa RLS) porque la app no tiene grant
-- de escritura sobre stock_levels. El CHECK on_hand>=0 aborta si sobrevendería.
--
-- Patrón UPDATE-primero-luego-INSERT (no `ON CONFLICT`): con `ON CONFLICT DO
-- UPDATE`, Postgres evalúa el CHECK sobre la TUPLA PROPUESTA del INSERT antes de
-- resolver el conflicto, así que un movimiento negativo (VALUES on_hand<0) sobre
-- una variante que YA tiene nivel fallaría aunque el update diera un valor válido.
-- El UPDATE primero evita proponer un on_hand negativo; el delta solo se chequea
-- ya sumado. El bucle + EXCEPTION cubre la carrera del primer alta concurrente.
CREATE OR REPLACE FUNCTION inventory.tg_apply_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  LOOP
    UPDATE inventory.stock_levels
      SET on_hand = on_hand + NEW.qty,
          version = version + 1,
          updated_at = now()
      WHERE variant_id = NEW.variant_id;
    IF FOUND THEN
      RETURN NEW;
    END IF;
    BEGIN
      INSERT INTO inventory.stock_levels (variant_id, on_hand, reserved, version)
      VALUES (NEW.variant_id, NEW.qty, 0, 1);
      RETURN NEW;
    EXCEPTION WHEN unique_violation THEN
      -- Otra transacción creó el nivel entremedio: reintentar el UPDATE.
    END;
  END LOOP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER stock_apply_movement
AFTER INSERT ON inventory.stock_movements
FOR EACH ROW
EXECUTE FUNCTION inventory.tg_apply_movement();