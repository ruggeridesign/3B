-- M7d.3 — métricas de comunidad. Función de agregación para el panel del admin de
-- comunidad: cuenta tiendas, Movers aprobados que operan ahí, pedidos, GMV (ventas
-- completadas), cobros pendientes y reportes abiertos de UNA comunidad.
--
-- SECURITY DEFINER (owner, bypassa RLS) para poder agregar a través de esquemas que la
-- RLS le ocultaría al admin de comunidad (p.ej. mover_profiles/orders ajenos). Se
-- **auto-guarda**: solo devuelve filas si el que consulta es admin de ESA comunidad o
-- de plataforma (lee `app.user_id` del contexto, como authz.*). Si no, no devuelve
-- filas → el llamador lo interpreta como "sin acceso".
CREATE OR REPLACE FUNCTION identity.community_metrics(p_community uuid)
RETURNS TABLE(
  stores bigint,
  movers bigint,
  orders bigint,
  gmv numeric,
  pending_collections bigint,
  open_reports bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT (authz.is_community_admin(p_community) OR authz.is_platform_admin()) THEN
    RETURN; -- sin acceso → sin filas
  END IF;
  RETURN QUERY
    SELECT
      (SELECT count(*) FROM store.stores s WHERE s.community_id = p_community),
      (SELECT count(*) FROM identity.mover_profiles m
         WHERE m.status = 'approved' AND p_community = ANY(m.operating_communities)),
      (SELECT count(*) FROM orders.orders o WHERE o.community_id = p_community),
      (SELECT COALESCE(sum(o.total), 0) FROM orders.orders o
         WHERE o.community_id = p_community AND o.status = 'completado'),
      (SELECT count(*) FROM billing.statements st
         WHERE st.status = 'pending' AND st.community_id = p_community),
      (SELECT count(*) FROM social.reports r
         WHERE r.status = 'open' AND r.community_id = p_community);
END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION identity.community_metrics(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION identity.community_metrics(uuid) TO app;
