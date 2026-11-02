CREATE TABLE "social"."reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reporter_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"resolution_note" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social"."reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."reports" ADD CONSTRAINT "reports_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "community"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "social"."reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_community_idx" ON "social"."reports" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "social"."reports" USING btree ("target_type","target_id");--> statement-breakpoint

-- CHECKs de dominio: tipo de target, estado y motivo con longitud razonable.
ALTER TABLE social.reports
  ADD CONSTRAINT reports_target_type_chk CHECK (target_type IN ('item','review','question','store')),
  ADD CONSTRAINT reports_status_chk CHECK (status IN ('open','reviewing','resolved','dismissed')),
  ADD CONSTRAINT reports_reason_chk CHECK (length(reason) BETWEEN 3 AND 1000);--> statement-breakpoint

-- RLS + grants. Lo crea quien ve la comunidad (como reporter); lo ve/resuelve el
-- admin de la comunidad reportada o un admin de plataforma (y el reporter ve el
-- suyo). `community_id` lo deriva el servicio del target (nunca del cliente). No se
-- borra (append-only salvo la resolución por UPDATE del admin).
GRANT SELECT, INSERT, UPDATE ON social.reports TO app;--> statement-breakpoint
ALTER TABLE social.reports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY reports_select ON social.reports FOR SELECT USING (
  reporter_id = authz.current_user_id()
  OR authz.is_community_admin(community_id)
  OR authz.is_platform_admin()
);--> statement-breakpoint
CREATE POLICY reports_insert ON social.reports FOR INSERT WITH CHECK (
  reporter_id = authz.current_user_id()
  AND authz.can_see_community(community_id)
);--> statement-breakpoint
CREATE POLICY reports_update ON social.reports FOR UPDATE USING (
  authz.is_community_admin(community_id) OR authz.is_platform_admin()
) WITH CHECK (
  authz.is_community_admin(community_id) OR authz.is_platform_admin()
);