# ADR-001 — Arquitectura fundacional

- **Estado**: Aceptada (implementada: base + Hito A + Hito B).
- **Fecha**: 2026-10-30.
- **Contexto**: arranque de 3B como marketplace comunitario multi-tenant,
  construido por 1 persona + agentes de IA, con presupuesto bajo y necesidad de
  escalar sin reescrituras (Playbook v1.0).

## Decisiones

1. **Monolito modular en un monorepo** (pnpm workspaces + Turborepo). Apps
   (`web`, `api`, `worker`) + packages (`ui`, `core`, `db`, `contracts`,
   `api-client`, `auth`, `config`). Toda la lógica de negocio en `@3b/core`,
   organizada por módulo (`domain`/`application`/`http`/`infra`).
2. **Límites estrictos** validados por dependency-cruiser: un módulo importa solo
   el `index.ts` de otro; `domain` puro; `apps/web` no toca la DB.
3. **TypeScript estricto** de punta a punta; **contratos Zod** (`@3b/contracts`)
   como única fuente de verdad entre capas.
4. **PostgreSQL 17 + PostGIS** (Docker local, puerto 5433), **Drizzle** para
   esquema/migraciones (un esquema por módulo).
5. **Better Auth** sobre `identity.users` (email; Google preparado), con la
   conexión _owner_ (gestiona identidades, bypassa RLS).
6. **Seguridad en capas**: RBAC con alcance (capacidades, no roles globales) +
   verificación de propiedad + **RLS de mínimo privilegio** (rol `app` sin
   BYPASSRLS, contexto por transacción, funciones `authz.*`). Auditoría de acciones
   sensibles en `platform.audit_log`.
7. **Gate de calidad**: `pnpm check` (Biome + typecheck + Vitest + boundaries) +
   `pnpm test:integration` (aislamiento RLS/RBAC contra DB real).

## Consecuencias

- Extraer un módulo a un servicio aparte más adelante es un **movimiento**, no una
  reescritura. El trabajo en paralelo es seguro gracias a límites + contratos.
- Costo: algo de ceremonia inicial (tooling, RLS por tabla) a cambio de robustez.
