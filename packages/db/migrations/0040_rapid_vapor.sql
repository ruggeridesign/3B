CREATE TABLE "identity"."push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "identity"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subs_user_idx" ON "identity"."push_subscriptions" USING btree ("user_id");--> statement-breakpoint

-- RLS + grants (M8d). Cada usuario gestiona SOLO sus propias suscripciones de push:
-- las crea/lee/actualiza/borra con `user_id = authz.current_user_id()`. El envío de
-- push (worker/owner) bypassa RLS. Un admin de plataforma puede leerlas (soporte).
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.push_subscriptions TO app;--> statement-breakpoint
ALTER TABLE identity.push_subscriptions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY push_subs_select ON identity.push_subscriptions FOR SELECT USING (
  user_id = authz.current_user_id() OR authz.is_platform_admin()
);--> statement-breakpoint
CREATE POLICY push_subs_insert ON identity.push_subscriptions FOR INSERT WITH CHECK (
  user_id = authz.current_user_id()
);--> statement-breakpoint
CREATE POLICY push_subs_update ON identity.push_subscriptions FOR UPDATE USING (
  user_id = authz.current_user_id()
) WITH CHECK (
  user_id = authz.current_user_id()
);--> statement-breakpoint
CREATE POLICY push_subs_delete ON identity.push_subscriptions FOR DELETE USING (
  user_id = authz.current_user_id()
);