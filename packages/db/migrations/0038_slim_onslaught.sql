ALTER TABLE "identity"."kyc_submissions" ADD COLUMN "community_id" uuid;--> statement-breakpoint
CREATE INDEX "kyc_community_idx" ON "identity"."kyc_submissions" USING btree ("community_id");--> statement-breakpoint

-- FK blanda a community.communities (no en el schema Drizzle para no acoplar
-- identity↔community, igual que media_id). La comunidad objetivo del KYC de Mover.
ALTER TABLE identity.kyc_submissions
  ADD CONSTRAINT kyc_submissions_community_id_fk FOREIGN KEY (community_id)
  REFERENCES community.communities(id) ON DELETE CASCADE;--> statement-breakpoint

-- RLS del caso **mover** (M7d.2). Se suma (OR) a las policies de `store` de M2. El
-- Mover ve/crea su propia verificación; el admin de la comunidad objetivo la ve y la
-- revisa. El alta fuerza `pending`, reviewer nulo y `community_id` seteado.
CREATE POLICY kyc_select_mover ON identity.kyc_submissions FOR SELECT USING (
  subject_type = 'mover' AND (
    subject_id = authz.current_user_id()
    OR (community_id IS NOT NULL AND authz.is_community_admin(community_id))
  )
);--> statement-breakpoint
CREATE POLICY kyc_insert_mover ON identity.kyc_submissions FOR INSERT WITH CHECK (
  status = 'pending' AND reviewer_id IS NULL
  AND subject_type = 'mover'
  AND subject_id = authz.current_user_id()
  AND community_id IS NOT NULL
);--> statement-breakpoint
CREATE POLICY kyc_update_mover ON identity.kyc_submissions FOR UPDATE USING (
  subject_type = 'mover' AND community_id IS NOT NULL
  AND authz.is_community_admin(community_id)
) WITH CHECK (
  subject_type = 'mover' AND community_id IS NOT NULL
  AND authz.is_community_admin(community_id)
);--> statement-breakpoint

-- Trigger extendido: además de fijar `verification_level` de la tienda (M2), al
-- **aprobar** una verificación de **Mover** marca el perfil `approved` y suma la
-- comunidad objetivo a `operating_communities` (dedupe). SECURITY DEFINER (owner):
-- escribe en mover_profiles sin dar UPDATE a `app` (que sigue siendo platform-only).
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
  ELSIF NEW.subject_type = 'mover' AND NEW.status = 'approved'
        AND NEW.community_id IS NOT NULL THEN
    INSERT INTO identity.mover_profiles (user_id, status, operating_communities)
      VALUES (NEW.subject_id, 'approved', ARRAY[NEW.community_id])
    ON CONFLICT (user_id) DO UPDATE
      SET status = 'approved',
          operating_communities = CASE
            WHEN NEW.community_id = ANY(identity.mover_profiles.operating_communities)
              THEN identity.mover_profiles.operating_communities
            ELSE array_append(identity.mover_profiles.operating_communities, NEW.community_id)
          END,
          updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;