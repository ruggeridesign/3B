# DDR — Registro de Decisiones de Diseño y Producto (3B)

> **Qué es esto.** Un historial vivo, en orden **cronológico inverso** (lo más
> nuevo arriba), con **una entrada por commit / feature / decisión**. El objetivo
> es que **cualquier persona o IA** pueda retomar el trabajo con contexto
> suficiente: qué se hizo, **por qué**, qué tocó y **cómo seguir**.
>
> **Relación con los ADR.** Los [ADR](architecture/adr/) registran decisiones
> **arquitectónicas** profundas (con alternativas y consecuencias). El DDR es el
> **diario** del proyecto: cada commit/feature deja su rastro acá y, si la
> decisión es estructural, enlaza al ADR correspondiente.
>
> **Cómo mantenerlo (obligatorio).** Al cerrar cada unidad de trabajo que termina
> en commit, agregar una entrada **arriba** con el formato de abajo. Convertir
> fechas relativas a absolutas. Enlazar archivos clave y ADR. Ver `CLAUDE.md`
> → "Documentación viva (DDR)".

## Formato de entrada

```
## <fecha> · `<hash>` · <tipo> — <título>
- **Qué:** qué se construyó/cambió, en una o dos líneas.
- **Por qué:** la razón / el problema que resuelve.
- **Impacto / archivos:** paquetes y archivos clave tocados.
- **Verificación:** cómo se comprobó (checks, tests, smoke, CI).
- **Estado para retomar:** qué queda, qué sigue, cuidados.
- **Relacionado:** ADR-00X, otras entradas, issues.
```

`tipo` ∈ `feat` · `fix` · `chore` · `docs` · `ci` · `refactor` · `decisión`.

---

## Estado actual (para retomar rápido)

- **Proyecto:** 3B, marketplace comunitario (Sellers/Makers/Movers), monorepo
  pnpm + Turborepo. Ver `CLAUDE.md` (stack, reglas, comandos) y
  `docs/architecture/data-model.md` (modelo de datos **aprobado**, ADR-002).
- **Hitos cerrados:** base del monorepo, **Hito A** (Postgres/PostGIS + migraciones
  + seed), **Hito B** (Better Auth + RBAC con alcance + RLS + auditoría + tests de
  aislamiento), **M1** completo (shell + "Ver como" + CI + helpers de autorización).
- **En curso:** **M2 · Tienda + Catálogo + núcleo de media**, por rebanadas
  verticales siguiendo `data-model.md §7`. **Store rebanadas 1 (alta + "mis
  tiendas")**, **2 (equipo/roles)** y **3 (métodos de pago) HECHAS**; siguiente:
  verificación (KYC) — requiere el núcleo de `media` primero—, o avanzar a
  `catalog`/`media`.
- **Entorno:** DB en Docker, puerto **5433** (el 5432 es un Postgres nativo).
  `pnpm check` debe quedar verde; `pnpm test:integration` corre RLS/RBAC contra
  DB real. CI en GitHub Actions valida ambos en cada push/PR a `main`.
- **Git:** commits **directos a `main`** (dev extra: Raphaelofwar). Un commit por
  unidad lógica; cada uno con su entrada en este DDR.

---

## 2026-10-31 · _(este commit)_ · feat — M2 store rebanada 3: métodos de pago (cifrados)

- **Qué:** una tienda carga sus medios de cobro (pago móvil, transferencia,
  Zelle, Binance, efectivo, otro). Tabla nueva `store.payment_methods` con los
  `details` **cifrados en reposo** (pgcrypto `pgp_sym_*`, base64). Endpoints
  `GET/POST /v1/stores/{id}/payment-methods` y
  `PATCH/DELETE /v1/stores/{id}/payment-methods/{pmId}`. En la página de detalle
  de la tienda: listado + alta con campos sugeridos por tipo + activar/desactivar
  + borrar (controles solo a managers).
- **Por qué:** tercer paso de M2 en store, autocontenido (un solo módulo, sin
  dependencias nuevas). Base para el checkout de M5. Se eligió antes que KYC
  porque KYC necesita el núcleo de `media` (imágenes del documento) y un flujo de
  revisión por admin de comunidad, todavía no construidos.
- **Impacto / archivos:** `packages/config/src/env.ts` (`PAYMENTS_ENC_KEY`, con
  default solo-dev); `packages/contracts/src/store.ts` (`PaymentMethodType`/
  `PaymentMethodDetails`/`PaymentMethod`/`PaymentMethodList`/`CreatePaymentMethodInput`/
  `UpdatePaymentMethodInput`); `packages/db/src/schema/store.ts` (`paymentMethods`)
  + migración `0006_confused_madelyne_pryor.sql` (tabla **+ RLS + grants anexados**);
  `packages/core/src/modules/store/infra/payment-repo.ts` (SQL crudo para cifrar/
  descifrar), `.../http/routes.ts` (4 rutas + `storeRouter` ahora recibe
  `{ paymentsEncKey }`), `.../index.ts`; `apps/api/src/index.ts` (pasa la clave);
  `apps/web/lib/stores.ts` (`getPaymentMethods`), `.../_components/store-payments.tsx`,
  `.../mi-tienda/[id]/page.tsx`; `packages/core/test/integration/payment.test.ts`.
- **Decisiones de diseño:**
  - **Cifrado en reposo con pgcrypto** (no diferido): `details` se guarda como
    base64 de `pgp_sym_encrypt(json, clave)`. La passphrase llega por **parámetro**
    desde `apps/api` (dueño de env) hasta el repo y el router — **core nunca importa
    `@3b/config`** (es solo devDependency; lo exige boundaries). Default solo-dev,
    igual que `BETTER_AUTH_SECRET`.
  - **RLS/grants anexados a la migración generada (`0006`)** en vez de una migración
    a mano aparte: evita duplicar el snapshot de meta (lo que ya había roto el chain
    0004/0005) y deja tabla+seguridad atómicas. De paso se corrigió el `id/prevId`
    de `0005_snapshot.json` (era copia literal de 0004) para que `generate` arme bien
    la cadena. Políticas: ver = cualquier miembro; escribir = owner/admin.
  - **`details` como mapa flexible** (`Record<string,string>`); validación por tipo
    queda para después. La web ofrece campos sugeridos por tipo.
  - La visibilidad de los métodos para el **comprador** en el checkout (M5) será una
    política RLS aparte; hoy solo ven los miembros de la tienda.
- **Verificación:** `pnpm check` verde; integración db 6/6 + **core 21/21** (+5 de
  pagos: round-trip del cifrado, que la columna **no** guarda el claro, editar/borrar,
  y RLS que deja a `sales` listar pero no crear, y a un no-miembro nada); smoke HTTP
  11/11 (200/403/403/403/201/200/200/404/204/404).
- **Estado para retomar:** siguiente: **verificación (KYC)** tras el núcleo de
  `media`, o abrir `catalog`/`media`. Pendientes de pagos: validación de `details`
  por tipo y la política de visibilidad para el comprador (M5).
- **Relacionado:** [data-model §store y §7](architecture/data-model.md), ADR-001,
  entradas de las rebanadas 1 y 2.

## 2026-10-31 · `9eeb8e5` · feat — M2 store rebanada 2: equipo/roles

- **Qué:** gestión del equipo de una tienda sobre `store.store_members`.
  Endpoints `GET /v1/stores/{id}/members`, `POST /v1/stores/{id}/members`
  (invitar por email), `PATCH /v1/stores/{id}/members/{userId}` (cambiar rol) y
  `DELETE /v1/stores/{id}/members/{userId}` (quitar). Página web de detalle
  `/mi-tienda/[id]` con el roster + invitar/cambiar rol/quitar (controles visibles
  solo a managers; la API gatea igual). Cada tienda de "mis tiendas" enlaza a su
  detalle.
- **Por qué:** una tienda la opera un equipo, no solo el dueño; segundo paso
  natural de M2 tras el alta. No hubo migración: `store_members` y su RLS ya
  existían desde Hito B.
- **Impacto / archivos:** `packages/contracts/src/store.ts`
  (`AssignableStoreRole`/`StoreMember`/`StoreMemberList`/`InviteStoreMemberInput`/
  `UpdateStoreMemberInput`); `packages/core/src/modules/store/infra/store-repo.ts`
  (`listStoreMembers`, `findUserIdByEmail`, `addStoreMember`,
  `updateStoreMemberRole`, `removeStoreMember`); `.../store/http/routes.ts` (4
  rutas nuevas) y `.../store/index.ts`; `apps/web/lib/stores.ts` (`getStore`,
  `getStoreMembers`), `apps/web/app/(shell)/mi-tienda/[id]/page.tsx`,
  `apps/web/app/_components/store-team.tsx`, lista enlazada en `mi-tienda/page.tsx`;
  `packages/core/test/integration/store.test.ts` (+4 tests).
- **Decisiones de diseño:**
  - **Invitar por email, no por UUID:** el servidor resuelve email→usuario bajo la
    RLS `users_select`, que solo deja ver a quien **comparte comunidad** con el que
    invita. Si no aparece (no existe o la RLS lo oculta) → `404` sin filtrar cuál.
    Es la UX natural y evita exponer UUID crudos en la web.
  - **Roles asignables por API = `admin|catalog|sales`** (nunca `owner`): la
    titularidad la fija el trigger de alta (rebanada 1); transferirla es otro flujo.
  - **Invariante del dueño en el repo** (no en el handler): `updateStoreMemberRole`/
    `removeStoreMember` devuelven un resultado discriminado
    (`ok | not_found | owner_protected`) y se niegan a tocar al `owner`. Va en el
    repo para que los tests de integración por-repo (patrón de la rebanada 1) lo
    cubran sin levantar HTTP y sin provocar un 500. El handler mapea a 200/404/409.
  - **`LEFT JOIN` a `users` en el roster:** así ningún miembro desaparece del
    listado si la RLS de `users` oculta su fila (name/email quedan en null, el rol
    siempre se ve).
  - Gating en capas: `GET` exige ser miembro (`isStoreMember`), las mutaciones
    `canManageStore` (owner/admin) — ambos derivados de las mismas `authz.*` que la
    RLS. Un miembro repetido viola la PK (23505) → el `onError` central lo pasa a 409.
- **Verificación:** `pnpm check` verde; integración 6/6 (db) + **16/16 (core**,
  incluye 4 de equipo: roster, invitar→cambiar rol→quitar, invariante del dueño,
  y RLS que bloquea a un `sales` invitando); smoke HTTP 11/11 (200/403/404/201/409/
  403/409/409/200/204).
- **Estado para retomar:** siguientes slices de store: **verificación (KYC)**
  (`identity.kyc_submissions` + `stores.verification_level`, migración + RLS) y
  **payment_methods** (`details` cifrados, migración + RLS); o avanzar a
  `catalog`/`media`. Transferencia de titularidad y un flujo de invitación con
  estado `pending` quedan pendientes (hoy la membresía es inmediata).
- **Relacionado:** [data-model §store y §7](architecture/data-model.md), ADR-001
  (seguridad en capas), entrada de la rebanada 1.

## 2026-10-31 · `b47c11a` · feat — M2 store rebanada 1: alta de tienda + "mis tiendas"

- **Qué:** primera rebanada vertical de M2. Un usuario abre una tienda en una
  comunidad de la que es miembro y ve "mis tiendas". Endpoints `POST /v1/stores`,
  `GET /v1/stores/mine`, `GET /v1/stores/{id}`. Página web "Mi Tienda" (lista +
  formulario) y CTA "Abrir una tienda" en el menú de usuario (para que un Maker
  sin tienda llegue al alta aunque el espacio esté gateado por `isSeller`).
- **Por qué:** `store` es la base de M2 (catálogo y media cuelgan de una tienda).
- **Impacto / archivos:** `packages/contracts/src/store.ts` (StoreKind/Status/
  CreateStoreInput/Store/Uuid); `packages/core/src/modules/store/**` (infra
  store-repo + http storeRouter); `apps/api` (monta storeRouter + `onError`
  central); `apps/web` (lib/stores + create-store + página mi-tienda + navbar);
  `packages/db/migrations/0005_store_owner_membership.sql`.
- **Decisiones de diseño:**
  - **Trigger de membresía owner (0005):** bajo RLS el creador no puede insertar
    su propia fila en `store_members` (la política exige ya ser owner/admin). Un
    trigger `SECURITY DEFINER` crea la membresía `owner` atómicamente con el
    INSERT de la tienda, sin abrir un hueco en la política.
  - **`onError` central para errores de Postgres → HTTP** (`@3b/core/http`
    `dbErrorResponse`): atrapar la violación de RLS/único DENTRO del handler no
    sirve, porque la transacción por-request queda abortada y el COMMIT posterior
    pisa la respuesta con 500. Se deja propagar (rollback limpio) y `onError`
    traduce el SQLSTATE: 42501→403, 23505→409, 23503→409, 23514/22P02→400.
  - **UUID lenient (`Uuid`):** los UUID deterministas del seed (`1111-…`) no
    cumplen la variante RFC, así que `z.string().uuid()` (estricto en Zod 4) los
    rechaza. Se valida la forma 8-4-4-4-12 hex, que la columna Postgres acepta.
  - Sin columnas extra todavía (geo, verificación/KYC, rating, payment_methods):
    van en slices posteriores de M2 con su propia migración.
- **Verificación:** `pnpm check` verde; integración 6/6 (db) + 12/12 (core,
  incluye 3 de store); smoke HTTP 401/201/403/409/400 + `/mine`.
- **Estado para retomar:** siguiente slice de store: **equipo/roles**
  (invitar miembros, gatear con `canManageStore`) y luego **verificación (KYC)** y
  **payment_methods**; o avanzar a `catalog`/`media`. Falta tabla y RLS de esas.
- **Relacionado:** [data-model §store y §7](architecture/data-model.md), ADR-002.

## 2026-10-31 · `5a5691a` · docs — Se crea el DDR (historial de decisiones)

- **Qué:** se crea `docs/DDR.md` (este archivo) con el estado actual + backfill de
  todas las decisiones/commits hasta hoy; se documenta la convención en
  `CLAUDE.md` ("Documentación viva (DDR)").
- **Por qué:** el usuario pidió un historial de decisiones de diseño/producto por
  cada commit y feature, con contexto suficiente para que **cualquier IA retome**
  el trabajo. Los ADR solos no alcanzan (son solo arquitectura).
- **Impacto / archivos:** `docs/DDR.md`, `CLAUDE.md`.
- **Estado para retomar:** de aquí en más, **toda** unidad de trabajo que termina
  en commit agrega su entrada arriba. Siguiente trabajo real: M2 rebanada `store`.

## 2026-10-31 · `5715a4c` · feat — Helpers de autorización reutilizables (cierra M1)

- **Qué:** primitivas de gating compartidas en `@3b/core/http`: guards de
  capacidad (`requireSession`, `requirePlatformAdmin`, `requireRealPlatformAdmin`)
  + accesores de contexto (`sessionCtx`, `realCtx`) + predicados por alcance/
  propiedad (`isPlatformAdmin`, `isStoreMember`, `canManageStore`,
  `isCommunityAdmin`, `isCommunityMember`, `isMoverApproved`).
- **Por qué:** evitar reinventar la autorización en cada ruta y dejar el patrón
  listo para M2. Viven en `@3b/core` (no en `apps/api`) para que los routers de
  los módulos las usen sin romper los límites de dependencias.
- **Impacto / archivos:** `packages/core/src/http/` (pasa de archivo único a
  carpeta: `types.ts` + `guards.ts` + `authz.ts` + `index.ts`); refactor de
  `modules/admin/http/routes.ts` y `modules/identity/http/routes.ts` para usar los
  guards; `packages/core/test/integration/authz.test.ts`.
- **Decisión de diseño:** los predicados derivan de las **mismas funciones
  `authz.*` (SECURITY DEFINER)** que usa la RLS → gate de ruta y RLS comparten una
  única fuente de verdad; el usuario evaluado es siempre el **efectivo** del
  contexto (`app.user_id`), nunca el cliente. Detalle de implementación: `sql`
  expande un array JS como lista `($1,$2)` (estilo IN), así que para `text[]` se
  pasa un literal `{...}` de un solo parámetro con cast.
- **Verificación:** `pnpm check` verde; 9/9 tests de integración de core; smoke
  HTTP (no-admin → 403, sin sesión → 401, impersonación intacta); CI verde.
- **Estado para retomar:** M1 cerrado. Siguiente: **M2 rebanada `store`**.
- **Relacionado:** ADR-001 (seguridad en capas), [data-model](architecture/data-model.md).

## 2026-10-31 · `9ced48d` · ci — GitHub Actions (check + integración)

- **Qué:** workflow `.github/workflows/ci.yml` con dos jobs: `check`
  (`pnpm check`, sin DB) e `integration` (Postgres 17 + PostGIS de servicio,
  bootstrap del rol `app` + extensiones vía `infra/db/init`, reset + migraciones
  + seed, tests RLS/RBAC). Corre en push y PR a `main`.
- **Por qué:** proteger `main` con 2+ devs trabajando directo sobre la rama:
  feedback inmediato (X roja en el commit) si algo rompe lint/tipos/tests/RLS.
- **Impacto / archivos:** `.github/workflows/ci.yml`.
- **Verificación:** run verde (ambos jobs `success`), incluida la integración
  contra DB real en el runner.
- **Estado para retomar:** para **bloquear** merges (no solo avisar) habría que
  activar *required status checks* en GitHub si se pasa a flujo con PRs. Aviso no
  bloqueante: `actions/*@v4` usan Node 20 (deprecándose); bump a `@v5` lo silencia.
- **Relacionado:** entrada `5715a4c`.

## 2026-10-30 · `b40d0a2` · feat — "Ver como" (impersonación de superadmin)

- **Qué:** el admin de plataforma recorre la app como cualquier usuario sin
  abandonar su sesión, con banner persistente y auditoría. Backend: middleware de
  `/v1` resuelve usuario **real** vs **efectivo** (cookie `3b_impersonate` →
  conmuta contexto RLS si el real es admin); rutas admin (lista de usuarios + iniciar/
  terminar impersonación); `/v1/me` expone `impersonating`. Web: control en navbar
  + banner `bg-brand`.
- **Por qué:** soporte/QA del superadmin sin credenciales de terceros; cierra M1.
- **Impacto / archivos:** `packages/contracts/src/identity.ts` (`Impersonation`),
  `packages/core/src/http.ts` (contexto real/efectivo), `modules/admin/*`,
  `modules/identity/http/routes.ts`, `apps/api/src/index.ts` (middleware),
  `apps/web/app/_components/{ver-como,impersonation-banner}.tsx`, navbar, layout.
- **Decisión de diseño:** nunca se confía en el cliente; el gate del **inicio/fin**
  usa el admin **real** (sigue disponible aun impersonando, para poder volver), y
  la lista de usuarios usa el admin **efectivo**. Acciones en `platform.audit_log`.
- **Verificación:** flujo end-to-end contra DB real + auditoría registrada.
- **Relacionado:** ADR-001.

## 2026-10-30 · `87ff532` · chore — Excluir `*.md` de Biome

- **Qué:** se agrega `!**/*.md` al alcance de Biome.
- **Por qué:** el formateador de Markdown de Biome 2.6 reflowea tablas anchas de
  forma no determinista (difiere entre modo global y archivo único) → `--write` no
  converge y rompe `pnpm check`. Los docs de arquitectura tienen tablas anchas y
  Mermaid que no queremos que toque. Mismo criterio que CSS/YAML.
- **Impacto / archivos:** `biome.json`.

## 2026-10-30 · `5e1027a` / `051dafc` · docs — Modelo de datos del MVP (ADR-001/002)

- **Qué:** `docs/architecture/data-model.md` (modelo conceptual/lógico/físico:
  diccionario, ER por dominio en Mermaid, autz/aislamiento, invariantes, máquinas
  de estado, migraciones incrementales por hito, 12 decisiones D-01..D-12) +
  **ADR-001** (arquitectura fundacional) y **ADR-002** (modelo de datos, Aceptada).
  Ajustes al roadmap. `051dafc` lo entrega para revisión; `5e1027a` lo marca
  **aprobado** y desbloquea M2.
- **Por qué:** cerrar la arquitectura de datos/objetos antes de implementar M2.
- **Impacto / archivos:** `docs/architecture/**`, `docs/ROADMAP.md`.
- **Estado para retomar:** D-07 (uuidv7 en tablas de alto volumen), D-01
  (`mover_profiles` → `shipping` en M6) y D-10 (moneda por pedido) confirmadas.
- **Relacionado:** ADR-002.

## 2026-10-30 · `98e5325` · docs — Roadmap hacia el MVP

- **Qué:** `docs/ROADMAP.md` con hitos M1–M9 (patrón vertical por módulo, PWA/
  rendimiento/a11y transversales, condiciones obligatorias para trabajo paralelo).
- **Por qué:** hoja de ruta compartida para repartir trabajo entre devs/agentes.

## 2026-10-30 · `030c3de` · feat — Shell (slice 1) + seed de credenciales

- **Qué:** cableado web↔API vía **BFF** (rewrites de Next proxyan `/api/auth` y
  `/v1`), login con Better Auth, navbar glass con **4 espacios gateados por
  capacidad** (Comprar/Mi Tienda/Mover/Admin), `/v1/me`. Seed de credenciales
  (`@3b/auth`, `Password123!`) integrado en `db:reset`.
- **Por qué:** primera rebanada vertical visible, probando toda la pila.
- **Impacto / archivos:** `apps/web/*` (shell, lib/me, auth-client, next.config),
  `packages/auth/src/seed-credentials.ts`.

## 2026-10-30 · `7927e19` · feat — Hito B (Better Auth + RBAC + RLS)

- **Qué:** módulos `system`/`identity`/`admin` en `@3b/core`; Better Auth sobre
  `identity.users`; **RLS de mínimo privilegio** (rol `app` sin BYPASSRLS, contexto
  por transacción con `withAppContext`, funciones `authz.*` SECURITY DEFINER);
  auditoría en `platform.audit_log`; tests de aislamiento RLS + capacidades RBAC.
- **Por qué:** backbone de seguridad en capas (RBAC con alcance + propiedad + RLS).
- **Impacto / archivos:** `packages/core/**`, `packages/auth/**`,
  `packages/db/migrations/0001_rls_security.sql` y siguientes.
- **Decisión de diseño:** identidad = **capacidades con alcance**, no roles
  globales (todo usuario es Maker; Seller/Mover/admin de comunidad son alcances).
- **Relacionado:** ADR-001.

## 2026-10-30 · `fcba6de` · feat — Hito A (Postgres/PostGIS + migraciones + seed)

- **Qué:** esquema Drizzle (un esquema por módulo), migraciones, seed determinista,
  `docker-compose.yml` (Postgres 17 + PostGIS) e `infra/db/init` (extensiones + rol
  `app`). DB publicada en **5433**.
- **Por qué:** persistencia real desde el inicio (sin fakes), base para Hito B.
- **Impacto / archivos:** `packages/db/**`, `docker-compose.yml`, `infra/db/init`.

## 2026-10-30 · `05fc5ba` / `80f938b` / `3ae4dea` / `56b145a` · chore/refactor — Monorepo

- **Qué:** conversión del repo (antes solo Design System) a **monorepo** pnpm +
  Turborepo; el DS se mueve a `packages/ui` (`@3b/ui`, consumido desde la fuente);
  apps `web`/`api`/`worker`; tooling (Biome, Vitest, dependency-cruiser) con
  `pnpm check`; normalización de EOL (`.gitattributes`).
- **Por qué:** estructura modular estricta para escalar sin reescrituras.
- **Impacto / archivos:** raíz del workspace, `packages/*`, `apps/*`.
- **Relacionado:** ADR-001.

## 2026-10-29 · `45c646a` · chore — Scaffold inicial del Design System

- **Qué:** punto de partida: Design System de 3B (Vite lib + Storybook, tokens,
  glassmorfismo, shadcn/ui new-york).
- **Por qué:** base visual del producto; luego absorbida como `@3b/ui`.
