-- RLS + RBAC con alcance para 3B.
-- La conexión de la app (rol `app`, sin BYPASSRLS) queda sujeta a estas políticas.
-- El contexto se fija por transacción con SET LOCAL app.user_id (y app.community_id).
-- Los permisos se DERIVAN de la base vía funciones SECURITY DEFINER: no se confía
-- en identificadores enviados por el cliente.

CREATE SCHEMA IF NOT EXISTS authz;
--> statement-breakpoint

-- Usuario actual (desde el contexto de la transacción).
CREATE OR REPLACE FUNCTION authz.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint

-- ¿Es admin de plataforma? Se deriva de la tabla, no del contexto.
CREATE OR REPLACE FUNCTION authz.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(
    (SELECT u.is_platform_admin FROM identity.users u WHERE u.id = authz.current_user_id()),
    false)
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION authz.is_member(cid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM community.memberships m
    WHERE m.user_id = authz.current_user_id()
      AND m.community_id = cid AND m.status = 'active'
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION authz.is_community_admin(cid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM community.memberships m
    WHERE m.user_id = authz.current_user_id()
      AND m.community_id = cid AND m.role = 'admin' AND m.status = 'active'
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION authz.is_store_member(sid uuid, roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM store.store_members sm
    WHERE sm.user_id = authz.current_user_id()
      AND sm.store_id = sid
      AND (roles IS NULL OR sm.role = ANY(roles))
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION authz.shares_community(other_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM community.memberships m1
    JOIN community.memberships m2 ON m1.community_id = m2.community_id
    WHERE m1.user_id = authz.current_user_id() AND m2.user_id = other_user
      AND m1.status = 'active' AND m2.status = 'active'
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION authz.can_see_community(cid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM community.communities c
    WHERE c.id = cid
      AND (c.visibility = 'public' OR authz.is_member(c.id) OR authz.is_platform_admin())
  )
$$;
--> statement-breakpoint

-- Grants de MÍNIMO PRIVILEGIO para el rol `app`.
GRANT USAGE ON SCHEMA identity, community, store, authz TO app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity, community, store TO app;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA authz TO app;
--> statement-breakpoint

-- Habilitar RLS en todas las tablas.
ALTER TABLE identity.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE identity.mover_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE community.communities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE community.community_links ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE community.memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE store.stores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE store.store_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ===== identity.users =====
CREATE POLICY users_select ON identity.users FOR SELECT USING (
  id = authz.current_user_id() OR authz.is_platform_admin() OR authz.shares_community(id)
);
--> statement-breakpoint
CREATE POLICY users_update ON identity.users FOR UPDATE USING (
  id = authz.current_user_id() OR authz.is_platform_admin()
) WITH CHECK (
  id = authz.current_user_id() OR authz.is_platform_admin()
);
--> statement-breakpoint
CREATE POLICY users_insert ON identity.users FOR INSERT WITH CHECK (authz.is_platform_admin());
--> statement-breakpoint
CREATE POLICY users_delete ON identity.users FOR DELETE USING (authz.is_platform_admin());
--> statement-breakpoint

-- ===== identity.mover_profiles =====
CREATE POLICY mover_select ON identity.mover_profiles FOR SELECT USING (
  user_id = authz.current_user_id() OR authz.is_platform_admin()
);
--> statement-breakpoint
CREATE POLICY mover_insert ON identity.mover_profiles FOR INSERT WITH CHECK (
  user_id = authz.current_user_id()
);
--> statement-breakpoint
CREATE POLICY mover_update ON identity.mover_profiles FOR UPDATE USING (authz.is_platform_admin()) WITH CHECK (authz.is_platform_admin());
--> statement-breakpoint
CREATE POLICY mover_delete ON identity.mover_profiles FOR DELETE USING (authz.is_platform_admin());
--> statement-breakpoint

-- ===== community.communities =====
CREATE POLICY comm_select ON community.communities FOR SELECT USING (
  visibility = 'public' OR authz.is_member(id) OR authz.is_platform_admin()
);
--> statement-breakpoint
CREATE POLICY comm_insert ON community.communities FOR INSERT WITH CHECK (authz.is_platform_admin());
--> statement-breakpoint
CREATE POLICY comm_update ON community.communities FOR UPDATE USING (
  authz.is_community_admin(id) OR authz.is_platform_admin()
) WITH CHECK (
  authz.is_community_admin(id) OR authz.is_platform_admin()
);
--> statement-breakpoint
CREATE POLICY comm_delete ON community.communities FOR DELETE USING (authz.is_platform_admin());
--> statement-breakpoint

-- ===== community.community_links =====
CREATE POLICY links_select ON community.community_links FOR SELECT USING (
  authz.can_see_community(community_id) OR authz.can_see_community(neighbor_id)
);
--> statement-breakpoint
CREATE POLICY links_write ON community.community_links FOR ALL USING (authz.is_platform_admin()) WITH CHECK (authz.is_platform_admin());
--> statement-breakpoint

-- ===== community.memberships =====
CREATE POLICY mem_select ON community.memberships FOR SELECT USING (
  user_id = authz.current_user_id() OR authz.is_community_admin(community_id) OR authz.is_platform_admin()
);
--> statement-breakpoint
CREATE POLICY mem_insert ON community.memberships FOR INSERT WITH CHECK (
  authz.is_community_admin(community_id) OR authz.is_platform_admin()
);
--> statement-breakpoint
CREATE POLICY mem_update ON community.memberships FOR UPDATE USING (
  authz.is_community_admin(community_id) OR authz.is_platform_admin()
) WITH CHECK (
  authz.is_community_admin(community_id) OR authz.is_platform_admin()
);
--> statement-breakpoint
CREATE POLICY mem_delete ON community.memberships FOR DELETE USING (
  authz.is_community_admin(community_id) OR authz.is_platform_admin()
);
--> statement-breakpoint

-- ===== store.stores =====
CREATE POLICY stores_select ON store.stores FOR SELECT USING (
  authz.is_platform_admin() OR authz.is_store_member(id, NULL) OR authz.can_see_community(community_id)
);
--> statement-breakpoint
CREATE POLICY stores_insert ON store.stores FOR INSERT WITH CHECK (
  authz.is_platform_admin() OR (owner_id = authz.current_user_id() AND authz.is_member(community_id))
);
--> statement-breakpoint
CREATE POLICY stores_update ON store.stores FOR UPDATE USING (
  authz.is_platform_admin() OR authz.is_store_member(id, ARRAY['owner','admin'])
) WITH CHECK (
  authz.is_platform_admin() OR authz.is_store_member(id, ARRAY['owner','admin'])
);
--> statement-breakpoint
CREATE POLICY stores_delete ON store.stores FOR DELETE USING (
  authz.is_platform_admin() OR authz.is_store_member(id, ARRAY['owner'])
);
--> statement-breakpoint

-- ===== store.store_members =====
CREATE POLICY sm_select ON store.store_members FOR SELECT USING (
  authz.is_platform_admin() OR authz.is_store_member(store_id, NULL)
);
--> statement-breakpoint
CREATE POLICY sm_insert ON store.store_members FOR INSERT WITH CHECK (
  authz.is_platform_admin() OR authz.is_store_member(store_id, ARRAY['owner','admin'])
);
--> statement-breakpoint
CREATE POLICY sm_update ON store.store_members FOR UPDATE USING (
  authz.is_platform_admin() OR authz.is_store_member(store_id, ARRAY['owner','admin'])
) WITH CHECK (
  authz.is_platform_admin() OR authz.is_store_member(store_id, ARRAY['owner','admin'])
);
--> statement-breakpoint
CREATE POLICY sm_delete ON store.store_members FOR DELETE USING (
  authz.is_platform_admin() OR authz.is_store_member(store_id, ARRAY['owner','admin'])
);
