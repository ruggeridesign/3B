# 3B — Roadmap de desarrollo

Hoja de ruta hacia el **MVP del piloto** (Playbook v1.0, Fase 1). Vivo: se
actualiza a medida que avanzamos. Pensado también para repartir trabajo entre
varias personas en paralelo.

> **Gate antes de M2**: ✅ modelo de datos **aprobado** —
> [`architecture/data-model.md`](architecture/data-model.md) + ADR-002. M2 puede
> comenzar siguiendo el plan de migraciones incrementales (§7 del modelo).

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

**Transversal en cada rebanada (obligatorio):** la cara web contempla desde el
inicio **PWA** (estados offline/instalable donde aplique), **presupuesto de
rendimiento** (JS inicial bajo, LCP) y **accesibilidad** (HTML semántico,
focus-visible, roles/aria). No se dejan para el final.

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
- **`media` (núcleo)**: tabla `media` + subida con URL firmada (R2 en prod,
  alternativa local en dev) + procesamiento de imágenes. Lo consumen ítems y tiendas.
- _Salida_: un Seller abre una tienda verificada y publica ítems con variantes e
  imágenes.

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

### M5 · Pedido end-to-end (dividido en entregables comprobables)

- **M5a · Carrito + checkout** (`orders`): carrito multitienda (un pedido por
  tienda), creación de pedido con `Idempotency-Key`, snapshot de precios/dirección.
  _Salida_: un Maker crea un pedido `realizado` desde el carrito.
- **M5b · Máquina de estados del pedido** (`orders` + `order_events`): transiciones
  válidas (realizado→aceptado→…→completado), reserva/liberación de stock,
  bitácora inmutable. _Salida_: el Seller mueve un pedido hasta `listo`.
- **M5c · Pago por comprobante** (`payments`): reporte de pago (referencia única +
  captura), confirmación/rechazo del Seller, `fx_rate_ves` congelado.
  _Salida_: pedido `pago_confirmado`.
- **M5d · Conversación + social** (`messaging` + `social`): chat contextual
  (ítem/pedido), preguntas públicas, reseñas verificadas al `completado`.
  _Salida_: pedido `completado` con reseña y un hilo de chat.

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

## Condiciones OBLIGATORIAS para el trabajo paralelo (agentes/devs)

Los módulos son **verticales independientes**: cada quien toma módulos distintos
(p. ej. uno `catalog`, otro `shipping`). Para que el paralelo no colisione, son
**requisitos no negociables**:

1. **Contratos primero**: todo DTO/enum/estado en `@3b/contracts` (Zod) antes de
   implementar. Es la frontera tipada entre módulos y con la web.
2. **Propiedad exclusiva de tablas**: cada tabla tiene **un** módulo dueño (ver
   `architecture/data-model.md`). Nadie escribe en tablas ajenas: se usa el
   `index.ts` del módulo o se reacciona a un evento del `outbox`. Lo valida
   **dependency-cruiser**.
3. **Coordinar por módulo**: no tocar el mismo `packages/core/modules/<x>` a la vez.
4. **Migraciones aditivas**: nunca editar una aplicada; una migración nueva por
   cambio, con su RLS.
5. **Regla de oro**: `pnpm check` verde antes de pushear; `git pull` + `pnpm install`
   al empezar.
