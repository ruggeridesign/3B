CREATE TABLE "social"."questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"author_name" text,
	"body" text NOT NULL,
	"answer" text,
	"answered_by" uuid,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social"."questions" ADD CONSTRAINT "questions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "catalog"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."questions" ADD CONSTRAINT "questions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "store"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."questions" ADD CONSTRAINT "questions_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "community"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."questions" ADD CONSTRAINT "questions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."questions" ADD CONSTRAINT "questions_answered_by_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "identity"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_item_idx" ON "social"."questions" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "questions_community_idx" ON "social"."questions" USING btree ("community_id");--> statement-breakpoint

-- CHECK de dominio: cuerpo con longitud razonable.
ALTER TABLE social.questions
  ADD CONSTRAINT questions_body_chk CHECK (length(body) BETWEEN 3 AND 1000);--> statement-breakpoint

-- RLS + grants. La pregunta es pública sobre un ítem visible: la ve quien ve la
-- comunidad (como el descubrimiento) o el propio autor; la hace cualquier miembro
-- que pueda ver la comunidad; la **responde** (UPDATE) solo un miembro de la
-- tienda del ítem. La RLS es el candado (el servicio pre-chequea para errores
-- limpios).
GRANT SELECT, INSERT, UPDATE ON social.questions TO app;--> statement-breakpoint
ALTER TABLE social.questions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY questions_select ON social.questions FOR SELECT USING (
  authz.can_see_community(community_id) OR author_id = authz.current_user_id()
);--> statement-breakpoint
CREATE POLICY questions_insert ON social.questions FOR INSERT WITH CHECK (
  author_id = authz.current_user_id()
  AND authz.can_see_community(community_id)
);--> statement-breakpoint
CREATE POLICY questions_update ON social.questions FOR UPDATE USING (
  authz.is_store_member(store_id, NULL)
) WITH CHECK (
  authz.is_store_member(store_id, NULL)
);