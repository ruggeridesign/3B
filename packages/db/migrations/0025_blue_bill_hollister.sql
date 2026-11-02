CREATE SCHEMA "social";
--> statement-breakpoint
CREATE TABLE "social"."reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"author_name" text,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_order_author_subject_unique" UNIQUE("order_id","author_id","subject_type")
);
--> statement-breakpoint
ALTER TABLE "social"."reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."reviews" ADD CONSTRAINT "reviews_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "community"."communities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_subject_idx" ON "social"."reviews" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "reviews_community_idx" ON "social"."reviews" USING btree ("community_id");--> statement-breakpoint

-- CHECKs de dominio: rating 1–5 y destinatario válido.
ALTER TABLE social.reviews
  ADD CONSTRAINT reviews_rating_chk CHECK (rating BETWEEN 1 AND 5),
  ADD CONSTRAINT reviews_subject_type_chk CHECK (subject_type IN ('store','mover','maker'));--> statement-breakpoint

-- RLS + grants. Esquema nuevo: USAGE al rol `app`. La reseña es append-only
-- (SELECT/INSERT; nunca UPDATE/DELETE). Visibilidad: quien ve la comunidad (como
-- el descubrimiento) o el propio autor. Alta: el autor = comprador de un pedido
-- `completado` de esa comunidad; si reseña la tienda (`store`), el `subject_id`
-- debe ser la tienda del pedido. La RLS es el candado (el servicio pre-chequea
-- para devolver errores limpios).
GRANT USAGE ON SCHEMA social TO app;--> statement-breakpoint
GRANT SELECT, INSERT ON social.reviews TO app;--> statement-breakpoint
ALTER TABLE social.reviews ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY reviews_select ON social.reviews FOR SELECT USING (
  authz.can_see_community(community_id) OR author_id = authz.current_user_id()
);--> statement-breakpoint
CREATE POLICY reviews_insert ON social.reviews FOR INSERT WITH CHECK (
  author_id = authz.current_user_id()
  AND authz.can_see_community(community_id)
  AND EXISTS (
    SELECT 1 FROM orders.orders o
    WHERE o.id = order_id
      AND o.maker_id = authz.current_user_id()
      AND o.status = 'completado'
      AND o.community_id = community_id
      AND (subject_type <> 'store' OR o.store_id = subject_id)
  )
);