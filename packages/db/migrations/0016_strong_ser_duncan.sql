CREATE TABLE "identity"."kyc_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"media_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewer_id" uuid,
	"review_notes" text,
	"expires_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store"."stores" ADD COLUMN "verification_level" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity"."kyc_submissions" ADD CONSTRAINT "kyc_submissions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kyc_subject_idx" ON "identity"."kyc_submissions" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "kyc_status_idx" ON "identity"."kyc_submissions" USING btree ("status");--> statement-breakpoint

-- FK blanda del documento a media.media (se agrega acá, no en el schema Drizzle,
-- para no acoplar los esquemas identity↔media y evitar un import circular).
ALTER TABLE identity.kyc_submissions
  ADD CONSTRAINT kyc_submissions_media_id_fk FOREIGN KEY (media_id)
  REFERENCES media.media(id) ON DELETE SET NULL;--> statement-breakpoint

-- CHECKs de validez (enums como text + CHECK, convención del modelo).
ALTER TABLE identity.kyc_submissions
  ADD CONSTRAINT kyc_subject_type_chk CHECK (subject_type IN ('store','mover')),
  ADD CONSTRAINT kyc_status_chk CHECK (status IN ('pending','approved','rejected'));--> statement-breakpoint

-- RLS + grants de kyc_submissions. Datos sensibles: para `store`, la ve/gestiona
-- el equipo de la tienda (owner/admin) o el admin de SU comunidad (revisor), más
-- el admin de plataforma. El submitter no puede auto-aprobar (el insert fuerza
-- status='pending' y reviewer nulo; solo el admin de comunidad hace update).
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.kyc_submissions TO app;--> statement-breakpoint
ALTER TABLE identity.kyc_submissions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY kyc_select ON identity.kyc_submissions FOR SELECT USING (
  authz.is_platform_admin()
  OR (subject_type = 'store' AND EXISTS (
        SELECT 1 FROM store.stores s WHERE s.id = subject_id
          AND (authz.is_store_member(s.id, ARRAY['owner','admin'])
               OR authz.is_community_admin(s.community_id))))
);--> statement-breakpoint
CREATE POLICY kyc_insert ON identity.kyc_submissions FOR INSERT WITH CHECK (
  status = 'pending' AND reviewer_id IS NULL
  AND subject_type = 'store' AND EXISTS (
        SELECT 1 FROM store.stores s WHERE s.id = subject_id
          AND authz.is_store_member(s.id, ARRAY['owner','admin']))
);--> statement-breakpoint
CREATE POLICY kyc_update ON identity.kyc_submissions FOR UPDATE USING (
  authz.is_platform_admin()
  OR (subject_type = 'store' AND EXISTS (
        SELECT 1 FROM store.stores s WHERE s.id = subject_id
          AND authz.is_community_admin(s.community_id)))
) WITH CHECK (
  authz.is_platform_admin()
  OR (subject_type = 'store' AND EXISTS (
        SELECT 1 FROM store.stores s WHERE s.id = subject_id
          AND authz.is_community_admin(s.community_id)))
);--> statement-breakpoint
CREATE POLICY kyc_delete ON identity.kyc_submissions FOR DELETE USING (
  authz.is_platform_admin()
  OR (subject_type = 'store' AND EXISTS (
        SELECT 1 FROM store.stores s WHERE s.id = subject_id
          AND authz.is_store_member(s.id, ARRAY['owner','admin'])))
);--> statement-breakpoint

-- Política de media adicional (permissive, se combina con OR): quien puede ver una
-- verificación KYC puede ver SU documento. La subconsulta a kyc_submissions queda
-- sujeta a kyc_select, así que el revisor (admin de comunidad) accede al archivo.
CREATE POLICY media_select_kyc ON media.media FOR SELECT USING (
  -- `media.media.id` calificado: `id` a secas resolvería a kyc_submissions.id
  -- (la tabla interna también tiene `id`) y nunca matchearía.
  EXISTS (SELECT 1 FROM identity.kyc_submissions k WHERE k.media_id = media.media.id)
);--> statement-breakpoint

-- Trigger: al aprobar/rechazar una verificación de tienda, fija el
-- `verification_level` de la tienda. SECURITY DEFINER (owner, bypassa RLS) para
-- escribir en store.stores de forma atómica con el cambio de estado.
CREATE OR REPLACE FUNCTION identity.tg_kyc_apply_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.subject_type = 'store' THEN
    IF NEW.status = 'approved' THEN
      UPDATE store.stores SET verification_level = 'verified', updated_at = now()
      WHERE id = NEW.subject_id;
    ELSIF NEW.status = 'rejected' THEN
      UPDATE store.stores SET verification_level = 'none', updated_at = now()
      WHERE id = NEW.subject_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER kyc_apply_verification
AFTER INSERT OR UPDATE OF status ON identity.kyc_submissions
FOR EACH ROW
EXECUTE FUNCTION identity.tg_kyc_apply_verification();