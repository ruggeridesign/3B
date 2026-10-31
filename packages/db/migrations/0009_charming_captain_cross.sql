CREATE TABLE "catalog"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'both' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "catalog"."items" ADD COLUMN "category_id" uuid;--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "catalog"."categories" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "catalog"."items" ADD CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "catalog"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- FK de jerarquía (auto-referencia); se maneja en SQL para no pelear con los
-- tipos de self-reference de Drizzle. RESTRICT: no borrar una categoría con hijas.
ALTER TABLE catalog.categories ADD CONSTRAINT categories_parent_fk
  FOREIGN KEY (parent_id) REFERENCES catalog.categories(id) ON DELETE RESTRICT;--> statement-breakpoint

-- RLS + grants: la taxonomía es de lectura pública (cualquier sesión) y solo la
-- escribe el admin de plataforma.
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog.categories TO app;--> statement-breakpoint
ALTER TABLE catalog.categories ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY categories_select ON catalog.categories FOR SELECT USING (true);--> statement-breakpoint
CREATE POLICY categories_insert ON catalog.categories FOR INSERT WITH CHECK (
  authz.is_platform_admin()
);--> statement-breakpoint
CREATE POLICY categories_update ON catalog.categories FOR UPDATE USING (
  authz.is_platform_admin()
) WITH CHECK (authz.is_platform_admin());--> statement-breakpoint
CREATE POLICY categories_delete ON catalog.categories FOR DELETE USING (
  authz.is_platform_admin()
);