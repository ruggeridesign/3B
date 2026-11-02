CREATE SCHEMA "messaging";
--> statement-breakpoint
CREATE TABLE "messaging"."conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context" text NOT NULL,
	"context_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_context_unique" UNIQUE("context","context_id")
);
--> statement-breakpoint
-- `messages` es **particionada por mes** (D-08) sobre `created_at`. Drizzle no
-- modela particiones declarativas, así que la DDL va a mano acá (el objeto de
-- Drizzle apunta a la tabla padre, solo para el query builder). La PK es
-- compuesta `(id, created_at)` porque Postgres exige la columna de partición en
-- toda clave única. Se crean particiones mensuales para la ventana actual + una
-- partición DEFAULT que atrapa cualquier fecha fuera de rango (los inserts nunca
-- fallan). Más adelante, un job del worker crea los meses nuevos y aplica la
-- retención de 90 días.
CREATE TABLE "messaging"."messages" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"media_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_id_created_at_pk" PRIMARY KEY("id","created_at")
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint
CREATE TABLE "messaging"."messages_2026_11" PARTITION OF "messaging"."messages"
	FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');--> statement-breakpoint
CREATE TABLE "messaging"."messages_2026_12" PARTITION OF "messaging"."messages"
	FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');--> statement-breakpoint
CREATE TABLE "messaging"."messages_2027_01" PARTITION OF "messaging"."messages"
	FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');--> statement-breakpoint
CREATE TABLE "messaging"."messages_default" PARTITION OF "messaging"."messages" DEFAULT;--> statement-breakpoint
ALTER TABLE "messaging"."messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging"."messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "identity"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging"."messages" ADD CONSTRAINT "messages_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "media"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_context_idx" ON "messaging"."conversations" USING btree ("context","context_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messaging"."messages" USING btree ("conversation_id","created_at");--> statement-breakpoint

-- CHECKs de dominio: contexto válido y cuerpo con longitud razonable.
ALTER TABLE messaging.conversations
  ADD CONSTRAINT conversations_context_chk CHECK (context IN ('item','order','shipment','store'));--> statement-breakpoint
ALTER TABLE messaging.messages
  ADD CONSTRAINT messages_body_chk CHECK (length(body) BETWEEN 1 AND 2000);--> statement-breakpoint

-- RLS + grants. Esquema nuevo: USAGE al rol `app`. El hilo deriva su autorización
-- del contexto: en `order`, lo ven/escriben el Maker dueño o un miembro de la
-- tienda del pedido. Los mensajes derivan su visibilidad de la conversación padre
-- (la subconsulta queda sujeta a la RLS de `conversations`). Para la tabla
-- particionada, las políticas del padre se aplican al acceder por el padre (que es
-- como lo hace la app); `app` no tiene grant sobre las particiones.
GRANT USAGE ON SCHEMA messaging TO app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON messaging.conversations TO app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON messaging.messages TO app;--> statement-breakpoint
ALTER TABLE messaging.conversations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE messaging.messages ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Visibilidad/alta/edición de la conversación de un pedido: ser participante
-- (Maker dueño o miembro de la tienda). La UPDATE es para refrescar
-- `last_message_at` al enviar.
CREATE POLICY conversations_select ON messaging.conversations FOR SELECT USING (
  context = 'order' AND EXISTS (
    SELECT 1 FROM orders.orders o WHERE o.id = context_id
      AND (o.maker_id = authz.current_user_id() OR authz.is_store_member(o.store_id, NULL)))
);--> statement-breakpoint
CREATE POLICY conversations_insert ON messaging.conversations FOR INSERT WITH CHECK (
  context = 'order' AND EXISTS (
    SELECT 1 FROM orders.orders o WHERE o.id = context_id
      AND (o.maker_id = authz.current_user_id() OR authz.is_store_member(o.store_id, NULL)))
);--> statement-breakpoint
CREATE POLICY conversations_update ON messaging.conversations FOR UPDATE USING (
  context = 'order' AND EXISTS (
    SELECT 1 FROM orders.orders o WHERE o.id = context_id
      AND (o.maker_id = authz.current_user_id() OR authz.is_store_member(o.store_id, NULL)))
) WITH CHECK (
  context = 'order' AND EXISTS (
    SELECT 1 FROM orders.orders o WHERE o.id = context_id
      AND (o.maker_id = authz.current_user_id() OR authz.is_store_member(o.store_id, NULL)))
);--> statement-breakpoint

-- Mensajes: se ven si la conversación padre es visible; se escriben solo como uno
-- mismo (`sender_id`); la UPDATE (marcar leído) exige ver la conversación.
CREATE POLICY messages_select ON messaging.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM messaging.conversations c WHERE c.id = conversation_id)
);--> statement-breakpoint
CREATE POLICY messages_insert ON messaging.messages FOR INSERT WITH CHECK (
  sender_id = authz.current_user_id()
  AND EXISTS (SELECT 1 FROM messaging.conversations c WHERE c.id = conversation_id)
);--> statement-breakpoint
CREATE POLICY messages_update ON messaging.messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM messaging.conversations c WHERE c.id = conversation_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM messaging.conversations c WHERE c.id = conversation_id)
);
