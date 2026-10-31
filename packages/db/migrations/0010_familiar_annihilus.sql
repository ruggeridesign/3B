CREATE TABLE "catalog"."attribute_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"scope_id" uuid,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"data_type" text NOT NULL,
	"options" jsonb,
	"unit" text,
	"filterable" boolean DEFAULT false NOT NULL,
	"variant_axis" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attr_defs_scope_key_unique" UNIQUE("scope","scope_id","key")
);
--> statement-breakpoint
CREATE INDEX "attr_defs_scope_idx" ON "catalog"."attribute_definitions" USING btree ("scope","scope_id");--> statement-breakpoint

-- El UNIQUE(scope, scope_id, key) NO cubre los globales (scope_id NULL se trata
-- como distinto en Postgres), así que una clave global podría duplicarse. Índice
-- único parcial que fuerza clave única entre los atributos globales.
CREATE UNIQUE INDEX "attr_defs_global_key_unique"
  ON catalog.attribute_definitions (key) WHERE scope = 'global';--> statement-breakpoint

-- RLS + grants de attribute_definitions (D-02, polimórfico por `scope`). Lectura:
-- global/categoría son públicas; las de tienda solo las ven sus miembros. Escritura:
-- global/categoría = admin de plataforma; de tienda = owner/admin/catalog.
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog.attribute_definitions TO app;--> statement-breakpoint
ALTER TABLE catalog.attribute_definitions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY attr_select ON catalog.attribute_definitions FOR SELECT USING (
  scope IN ('global','category')
  OR (scope = 'store' AND authz.is_store_member(scope_id, NULL))
  OR authz.is_platform_admin()
);--> statement-breakpoint
CREATE POLICY attr_insert ON catalog.attribute_definitions FOR INSERT WITH CHECK (
  (scope IN ('global','category') AND authz.is_platform_admin())
  OR (scope = 'store' AND authz.is_store_member(scope_id, ARRAY['owner','admin','catalog']))
);--> statement-breakpoint
CREATE POLICY attr_update ON catalog.attribute_definitions FOR UPDATE USING (
  (scope IN ('global','category') AND authz.is_platform_admin())
  OR (scope = 'store' AND authz.is_store_member(scope_id, ARRAY['owner','admin','catalog']))
) WITH CHECK (
  (scope IN ('global','category') AND authz.is_platform_admin())
  OR (scope = 'store' AND authz.is_store_member(scope_id, ARRAY['owner','admin','catalog']))
);--> statement-breakpoint
CREATE POLICY attr_delete ON catalog.attribute_definitions FOR DELETE USING (
  (scope IN ('global','category') AND authz.is_platform_admin())
  OR (scope = 'store' AND authz.is_store_member(scope_id, ARRAY['owner','admin','catalog']))
);