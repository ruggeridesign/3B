CREATE SCHEMA "tracking";
--> statement-breakpoint
-- `location_pings` **particionada por mes** (D-08) sobre `recorded_at`; `point` es
-- `geography(Point,4326)` (PostGIS). Drizzle no modela ni el particionado ni el
-- geography, así que la DDL va a mano (el objeto Drizzle es solo para el query
-- builder; la app inserta/lee el punto por SQL crudo). Append-only, sin PK (se
-- consulta por shipment_id + recorded_at). Particiones mensuales + DEFAULT.
CREATE TABLE "tracking"."location_pings" (
	"shipment_id" uuid NOT NULL,
	"point" geography(Point,4326) NOT NULL,
	"speed" numeric(6, 2),
	"heading" integer,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
) PARTITION BY RANGE ("recorded_at");
--> statement-breakpoint
CREATE TABLE "tracking"."location_pings_2026_11" PARTITION OF "tracking"."location_pings"
	FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');--> statement-breakpoint
CREATE TABLE "tracking"."location_pings_2026_12" PARTITION OF "tracking"."location_pings"
	FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');--> statement-breakpoint
CREATE TABLE "tracking"."location_pings_2027_01" PARTITION OF "tracking"."location_pings"
	FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');--> statement-breakpoint
CREATE TABLE "tracking"."location_pings_default" PARTITION OF "tracking"."location_pings" DEFAULT;--> statement-breakpoint
ALTER TABLE "tracking"."location_pings" ADD CONSTRAINT "location_pings_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "shipping"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_pings_shipment_idx" ON "tracking"."location_pings" USING btree ("shipment_id","recorded_at");--> statement-breakpoint
CREATE INDEX "location_pings_point_gix" ON "tracking"."location_pings" USING GIST ("point");--> statement-breakpoint

-- RLS + grants. Append-only (SELECT/INSERT; nunca UPDATE/DELETE). La ve quien ve el
-- envío padre (la subconsulta queda sujeta a la RLS de `shipments`); la escribe solo
-- el **Mover asignado**. Para la tabla particionada, las políticas del padre aplican
-- al acceder por el padre (como lo hace la app); `app` no tiene grant sobre las
-- particiones.
GRANT USAGE ON SCHEMA tracking TO app;--> statement-breakpoint
GRANT SELECT, INSERT ON tracking.location_pings TO app;--> statement-breakpoint
ALTER TABLE tracking.location_pings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY location_pings_select ON tracking.location_pings FOR SELECT USING (
  EXISTS (SELECT 1 FROM shipping.shipments s WHERE s.id = shipment_id)
);--> statement-breakpoint
CREATE POLICY location_pings_insert ON tracking.location_pings FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM shipping.shipments s WHERE s.id = shipment_id
    AND s.mover_id = authz.current_user_id())
);
