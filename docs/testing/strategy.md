# Estrategia de testing de 3B

Guía de las capas de prueba, cómo correrlas y cómo extenderlas. La idea es una
**pirámide**: mucha cobertura barata y rápida abajo, menos (pero de alto valor)
arriba. Todo corre en CI (`.github/workflows/ci.yml`).

## Capas

| Capa | Dónde | Qué prueba | DB | Comando |
| --- | --- | --- | --- | --- |
| **Unit (dominio)** | `packages/core/src/**/*.test.ts` | lógica pura (pricing, transiciones, validaciones) | no | `pnpm test` |
| **Componentes web** | `apps/web/test/**` | UI por rol (navbar, "Ver como") con RTL + jsdom | no | `pnpm --filter @3b/web test` |
| **Integración (RLS/RBAC)** | `packages/{db,core}/test/integration/**` | lógica de aplicación + RLS/capacidades contra DB real | sí | `pnpm test:integration` |
| **API/HTTP** | `apps/api/test/integration/**` | routers Hono in-process: sesión, impersonación, validación, códigos | sí | `pnpm test:integration` |
| **E2E** | `e2e/**` | flujos por rol contra web+api+DB en Chromium | sí | `pnpm test:e2e` |
| **Manual** | `docs/testing/manual-qa.md` | exploratorio, a mano, por rol | sí | — |

`pnpm check` corre lint + typecheck + **unit + componentes** + boundaries (sin DB).

## Correr cada capa

```bash
pnpm check                      # unit + componentes + lint/typecheck/boundaries (sin DB)
pnpm --filter @3b/web test      # solo componentes web (RTL)
pnpm test:integration           # reset+seed + RLS/RBAC (db, core) + API/HTTP (api)
pnpm exec playwright install chromium   # una vez: baja el navegador
pnpm test:e2e                   # E2E (requiere DB sembrada + web/api; los levanta/reusa)
pnpm test:e2e:ui                # E2E en modo interactivo
```

Prerrequisito de las capas con DB: `pnpm db:up` (Postgres+Valkey) y una base
**sembrada**. `pnpm test:integration` resetea y siembra solo; para E2E, correr
`pnpm db:reset` antes si se quiere estado determinista.

## Convenciones

- **Usuarios y UUIDs del seed** son la fuente de verdad de los tests. Emails y
  password de dev viven en `packages/auth/src/seed-credentials.ts`
  (`Password123!`); los UUIDs deterministas, en los tests de integración de core
  (y centralizados para API en `apps/api/test/integration/helpers/client.ts`).
- **DB compartida:** los tests de integración corren contra una sola base sembrada y
  **secuencialmente** (`fileParallelism:false`). Un test que **reserva stock** debe
  usar su **propia variante** para que las aserciones sean deterministas (ver la
  memoria del proyecto y `orders.test.ts`).
- **E2E por rol:** el proyecto `setup` loguea cada usuario una vez y guarda su sesión
  (`e2e/.auth/<rol>.json`, gitignored); cada spec la reusa con
  `test.use({ storageState })`. Aserciones sobre anclas estables (h1 por página,
  textos de banner), no sobre clases CSS.
- **Aislar la UI en componentes:** se mockean `next/navigation`, `next/link`,
  `fetch` y los módulos cliente (cart, auth). `@3b/ui` se "inline" en vitest porque se
  consume desde la fuente TSX.

## Cómo extender (hacia "todas las funcionalidades, todos los usuarios")

1. **Nueva capacidad/endpoint** → sumar un test de **API/HTTP** (happy path + authz
   401/403 + validación) siguiendo el patrón de `apps/api/test/integration/*`.
2. **Nueva vista o cambio de navbar** → fixture de `MeResponse` + caso en
   `apps/web/test/navbar.test.tsx` u otro componente.
3. **Nuevo flujo de usuario** → spec en `e2e/flows/` reusando el `storageState` del
   rol; empezar por el camino feliz y agregar bordes.
4. Reflejar el flujo en `docs/testing/manual-qa.md` para mantener alineado lo manual
   con lo automático.

## Estado (rutas críticas — primera iteración)

Cubierto hoy: capacidades/`/v1/me` por usuario, gating, **impersonación ("Ver
como")**, checkout (crear pedido) a nivel API; navbar por rol + `pickRep` en
componentes; y E2E de camino feliz por rol (Maker/Seller/Mover/Comunidad/Admin) +
auth. Pendiente de profundizar: transacciones completas en E2E (checkout de punta a
punta, aceptar/entregar pedido, rastreo, billing).
