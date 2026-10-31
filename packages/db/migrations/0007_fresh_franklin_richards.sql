CREATE SCHEMA "media";
--> statement-breakpoint
CREATE TABLE "media"."media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"mime" text NOT NULL,
	"sizes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media"."media" ADD CONSTRAINT "media_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_owner_idx" ON "media"."media" USING btree ("owner_type","owner_id");--> statement-breakpoint

-- RLS + grants de media.media (patrón de 0001). El esquema `media` es nuevo:
-- hay que otorgar USAGE al rol `app`. El acceso se acota por `created_by`: cada
-- quien gestiona SU propia media. La autorización por entidad dueña (p. ej.
-- poder administrar la tienda) la agrega el handler de la API; el archivo en sí
-- se sirve por su URL de storage, no por esta tabla.
GRANT USAGE ON SCHEMA media TO app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON media.media TO app;--> statement-breakpoint
ALTER TABLE media.media ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY media_select ON media.media FOR SELECT USING (
  created_by = authz.current_user_id() OR authz.is_platform_admin()
);--> statement-breakpoint
CREATE POLICY media_insert ON media.media FOR INSERT WITH CHECK (
  created_by = authz.current_user_id()
);--> statement-breakpoint
CREATE POLICY media_update ON media.media FOR UPDATE USING (
  created_by = authz.current_user_id() OR authz.is_platform_admin()
) WITH CHECK (
  created_by = authz.current_user_id() OR authz.is_platform_admin()
);--> statement-breakpoint
CREATE POLICY media_delete ON media.media FOR DELETE USING (
  created_by = authz.current_user_id() OR authz.is_platform_admin()
);