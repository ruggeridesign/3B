CREATE TABLE "store"."payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"type" text NOT NULL,
	"details" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store"."payment_methods" ADD CONSTRAINT "payment_methods_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "store"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_methods_store_idx" ON "store"."payment_methods" USING btree ("store_id");--> statement-breakpoint

-- RLS + grants de store.payment_methods (patrón de 0001). El rol `app` queda
-- sujeto a las políticas; ver = cualquier miembro de la tienda, escribir =
-- owner/admin (los detalles ya viajan cifrados). La visibilidad para el
-- comprador en el checkout (M5) será una política aparte.
GRANT SELECT, INSERT, UPDATE, DELETE ON store.payment_methods TO app;--> statement-breakpoint
ALTER TABLE store.payment_methods ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY pm_select ON store.payment_methods FOR SELECT USING (
  authz.is_platform_admin() OR authz.is_store_member(store_id, NULL)
);--> statement-breakpoint
CREATE POLICY pm_insert ON store.payment_methods FOR INSERT WITH CHECK (
  authz.is_platform_admin() OR authz.is_store_member(store_id, ARRAY['owner','admin'])
);--> statement-breakpoint
CREATE POLICY pm_update ON store.payment_methods FOR UPDATE USING (
  authz.is_platform_admin() OR authz.is_store_member(store_id, ARRAY['owner','admin'])
) WITH CHECK (
  authz.is_platform_admin() OR authz.is_store_member(store_id, ARRAY['owner','admin'])
);--> statement-breakpoint
CREATE POLICY pm_delete ON store.payment_methods FOR DELETE USING (
  authz.is_platform_admin() OR authz.is_store_member(store_id, ARRAY['owner','admin'])
);