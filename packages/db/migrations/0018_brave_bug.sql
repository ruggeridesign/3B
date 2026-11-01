-- Wrapper IMMUTABLE de unaccent (la función de la extensión es STABLE y no sirve
-- en columnas/índices generados). Fija el diccionario explícito para que sea
-- determinista. PUBLIC conserva EXECUTE por defecto, así que el rol `app` puede
-- usarla en las consultas de búsqueda.
CREATE OR REPLACE FUNCTION catalog.f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
  $$ SELECT public.unaccent('public.unaccent', $1) $$;--> statement-breakpoint

-- Columna GENERADA: tsvector en español de título+descripción sin acentos. Se
-- computa para las filas existentes al agregarse (STORED). GIN para full-text.
ALTER TABLE "catalog"."items" ADD COLUMN "search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('spanish', catalog.f_unaccent(coalesce(title,'') || ' ' || coalesce(description,'')))) STORED;--> statement-breakpoint
CREATE INDEX "items_search_tsv_idx" ON "catalog"."items" USING gin ("search_tsv");--> statement-breakpoint

-- Índice pg_trgm sobre el título sin acentos: habilita ILIKE/similaridad con
-- tolerancia a tipeos (búsqueda difusa como complemento del full-text).
CREATE INDEX items_title_trgm_idx ON catalog.items USING gin (catalog.f_unaccent(title) gin_trgm_ops);