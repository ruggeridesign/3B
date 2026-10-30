-- Grants + RLS para la bitácora de auditoría (platform.audit_log).
-- El rol `app` solo puede INSERTAR (con actor = usuario actual) y, si es admin
-- de plataforma, LEER. No puede modificar ni borrar (bitácora de solo inserción).

GRANT USAGE ON SCHEMA platform TO app;
--> statement-breakpoint
GRANT SELECT, INSERT ON platform.audit_log TO app;
--> statement-breakpoint
ALTER TABLE platform.audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_select ON platform.audit_log FOR SELECT USING (
  authz.is_platform_admin()
);
--> statement-breakpoint
CREATE POLICY audit_insert ON platform.audit_log FOR INSERT WITH CHECK (
  actor_id = authz.current_user_id() OR authz.is_platform_admin()
);
