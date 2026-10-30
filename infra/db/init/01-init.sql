-- Inicialización de la base de 3B.
-- Se ejecuta UNA sola vez, al crear el contenedor (como superusuario `3b`,
-- vía /docker-entrypoint-initdb.d). Para re-ejecutar: borrar el volumen.

-- Extensiones requeridas por 3B (se verifican en Hito A).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS ltree;

-- Rol de aplicación de MÍNIMO PRIVILEGIO:
--   * NO es dueño de las tablas (las crea el owner `3b` en las migraciones),
--   * NO tiene BYPASSRLS → las políticas RLS siempre aplican a esta conexión.
-- Los GRANT concretos sobre esquemas/tablas y las políticas RLS se definen
-- en Hito B. La app runtime se conecta como `app`; las migraciones, como `3b`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app LOGIN PASSWORD 'app';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE "3b" TO app;
