# 3B — Roadmap de desarrollo

Hoja de ruta hacia el **MVP del piloto** (Playbook v1.0, Fase 1). Vivo: se
actualiza a medida que avanzamos. Pensado también para repartir trabajo entre
varias personas en paralelo.

## Cómo se construye cada módulo (patrón vertical)

Todo módulo de negocio se implementa como una **rebanada vertical** siguiendo el
patrón ya probado con `identity`/`community`/`store`:

1. **`@3b/contracts`** — DTOs/enums/estados en Zod (fuente única).
2. **`@3b/db`** — esquema Drizzle (un esquema Postgres por módulo) + migración
   nueva (nunca editar una aplicada) + **RLS** con `authz.*` + seed.
3. **`@3b/core/modules/<m>`** — `domain` (puro) → `application` (casos de uso) →
   `infra` (repos Drizzle) → `http` (router OpenAPI). `index.ts` = API pública.
4. **`@3b/api`** — monta el router bajo `/v1` (middleware de auth/contexto ya listo).
5. **`@3b/api-client`** — método tipado (o generado desde OpenAPI).
6. **`apps/web`** — pantalla(s) en el espacio correspondiente, consumiendo la API.
7. **Tests**: unit (domain/application) + integración (RLS/RBAC) + e2e en flujos clave.
8. `pnpm check` **verde** antes de pushear.

## Estado actual (hecho) ✅

- **Base**: monorepo (pnpm + Turbo), `pnpm check` (Biome + typecheck + Vitest +
  dependency-cruiser), Design System en `@3b/ui`.
- **Hito A**: Postgres 17 + PostGIS (Docker, puerto 5433), migraciones y seed.
- **Hito B**: Better Auth (email; Google preparado), RBAC con alcance, **RLS de
  mínimo privilegio**, auditoría, tests de aislamiento (RLS + RBAC).
- **Shell (slice 1)**: web↔API vía BFF, login, navbar glass con **4 espacios
  gateados por capacidades**, `/v1/me`.

---

## Milestones

### M1 · Shell completo + CI (en curso)

- **"Ver como"** (impersonación de superadmin): contexto RLS → usuario objetivo,
  banner visible, auditoría. Control en la navbar.
- **Autorización reutilizable** en `@3b/api`: helpers para gatear por capacidad y
  por propiedad en cada ruta (no solo `/me`).
- **CI (GitHub Actions)**: corre `pnpm check` + `pnpm test:integration` (con
  Postgres de servicio) en cada push a `main`. Clave con 2+ devs en `main`.
- _Salida_: el superadmin recorre todos los espacios como cualquier perfil; `main`
  protegido por CI.

### M2 · Tienda + Catálogo atomizado

- `store`: alta de tienda (productos/servicios), equipo y roles, verificación
  (KYC), métodos de pago.
- `catalog`: atributos → plantillas → ítems → ejes/variantes → colecciones;
  validación Zod heredada (global→categoría→tienda); proyección a índice de filtros.
- _Salida_: un Seller abre una tienda verificada y publica ítems con variantes.

### M3 · Inventario en tiempo real + mostrador

- `inventory`: `stock_levels`/`stock_movements` (libro de solo inserción), reservas
  con vencimiento, mostrador (POS ligero), idempotencia.
- **Infra**: se enciende **Valkey** (pub/sub) + **worker** (outbox + BullMQ) para
  liberar reservas y emitir `stock.changed`.
- _Salida_: stock en vivo sin sobreventa, sincronizado entre canales.

### M4 · Descubrimiento

- Feed por comunidad, búsqueda (pg_trgm + unaccent + `search_tsv`), filtros
  dinámicos, ficha de ítem/tienda, `ranking` básico.
- _Salida_: un Maker encuentra y ve ítems/tiendas de su comunidad (y vecinas).

### M5 · Pedido end-to-end

- `orders` (carrito multitienda, checkout, máquina de estados), `payments`
  (reporte de comprobante + confirmación + tasa BCV congelada), `messaging`
  (chat contextual), `social` (preguntas públicas + reseñas verificadas).
- _Salida_: pedido completo con comprobante confirmado y reseña.

### M6 · Envíos y rastreo

- `shipping` (solicitudes, ofertas de Movers, tarifarios), `tracking` (posición en
  vivo). **Infra**: WebSockets en `@3b/api` + GEO en Valkey.
- _Salida_: envío solicitado → ofertado → asignado → entregado con PIN.

### M7 · Billing + panel de comunidad

- `billing`: suscripciones, comisiones devengadas, estados de cuenta mensuales.
- Admin de comunidad: cola de verificaciones, confirmación de cobros, métricas.
- _Salida_: estado de cuenta (suscripción + comisiones) por tienda/Mover.

### M8 · PWA

- Serwist (service worker), cola offline (Background Sync), instalable, push (VAPID),
  presupuesto de rendimiento (<170 KB JS inicial, LCP < 2,5 s en 3G).
- _Salida_: app instalable y tolerante a cortes de conexión.

### M9 · Capa de diseño / MVP

- Pulido visual con el DS, sistema de motion propio, estados (loading/vacío/error),
  accesibilidad (a11y), microinteracciones.
- _Salida_: MVP del piloto presentable (Playbook Fase 1).

---

## Transversal (continuo)

- `notifications` (push/email/in-app sobre el outbox) y `media` (imágenes; R2 en
  prod, alternativa local en dev) se incorporan cuando el primer módulo los pide.
- **Testing**: unit + integración (RLS/RBAC) por módulo; Playwright en flujos
  críticos a partir de M5.
- **Observabilidad** (Sentry/pino): hacia el final, antes de producción.

## Reparto en paralelo (p. ej. con Raphaelofwar)

- Los módulos son **verticales independientes**: cada dev toma módulos distintos
  (p. ej. uno `catalog`, otro `shipping`). Los **límites de dependency-cruiser** y
  los **contratos Zod** evitan colisiones; las **migraciones son aditivas**.
- Coordinar por módulo (no tocar el mismo `packages/core/modules/<x>` a la vez).
- Regla de oro compartida: `pnpm check` verde antes de pushear; `git pull` +
  `pnpm install` al empezar; nunca editar una migración aplicada.
