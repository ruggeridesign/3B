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
  aislamiento), **M1** completo (shell + "Ver como" + CI + helpers de autorización),
  **M2** (tienda+catálogo+media; ver abajo), **M4 · Descubrimiento** (cerrado salvo
  la proyección de ranking con señales de comportamiento).
- **M8 · PWA — EN CURSO.** **M8a + M8b + M8c.1 cerrados.** **M8a:** la web es **instalable** y
  abre **offline**. Service worker con `@serwist/turbopack` (camino correcto para el build
  Turbopack de Next 16; `@serwist/next`/webpack no aplica), SW en `app/sw.ts` servido por
  `app/serwist/[path]/route.ts`, `manifest.webmanifest` (`app/manifest.ts`, crema `#f4f2e0`),
  íconos "3B" por `ImageResponse` (sin binarios; pulido en M9), `viewport`/`themeColor` + meta
  apple y `<SerwistProvider>` (SW desactivado en dev). **M8b — offline resiliente:** el SW cachea
  los GETs de `/v1` con **NetworkFirst** (`api-v1`, timeout 3 s, solo 200, 1 día) y `/api/auth`
  con **NetworkOnly** (nunca la sesión); `ConnectionStatus` (barra en el shell) avisa cuando se
  cae la red. **M8c.1 — cola offline (Background Sync):** el SW encola las mutaciones a `/v1`
  (POST/PUT/PATCH/DELETE → `BackgroundSyncPlugin` `mutations-v1`) y las reenvía al reconectar,
  avisando a las pestañas (`mutations-synced` → `SyncListener` refresca). Helper cliente
  `lib/mutate.ts` (feedback `ok`/`queued`/`error` + Idempotency-Key), integrado en el flujo de
  pedidos (`order-actions`) como referencia. **Siguiente: M8c.2** — migrar el resto de los flujos
  de mutación (pagos, chat, reseñas, preguntas, reportes, envíos, KYC…) al helper `mutate()`.
  Luego M8d (push VAPID: tabla + API + worker + permiso) y M8e (presupuesto de rendimiento
  <170 KB JS inicial / LCP < 2,5 s). Mejora futura: purgar la caché `api-v1` al cerrar sesión.
- **M7 · Billing + panel de comunidad — CERRADO.** **M7a/M7b/M7c/M7d** completos (módulo
  `billing` + identity/comunidad). `plans` + `subscriptions` (una por tienda; `trial` por
  trigger; la cambia un admin); `fee_accruals` (polimórfico `store`|`mover`): al `completado`
  devenga comisión de venta a la tienda (+ `orders.fee_amount`) y al `entregado` comisión de
  envío al Mover (S-3), vía triggers definer, tasa **% por env**; `statements` (polimórfico,
  mensual): un **job del worker** (owner) suma suscripción + comisiones con
  `billing.generate_statements(period)`; **cobro por comprobante** (D-03): el sujeto reporta el
  pago de un estado `open` (reusando `payment_reports` con `statement_id`) → `pending`, y un
  admin confirma (`paid`) o rechaza (`open`), vía triggers definer. **Panel de comunidad**
  (`/comunidad`, admins de comunidad): verificaciones de tienda **y de Mover** (KYC), **cobros**
  por confirmar, **reportes**, y **métricas** (tiendas, Movers, pedidos, GMV, cobros, reportes
  vía función definer auto-guardada). **KYC + aprobación de Movers**: un usuario se postula en
  una comunidad (`/mover` → KYC de sujeto `mover` con `community_id`); al aprobar, el trigger
  pone `mover_profiles.status='approved'` + suma la comunidad a `operating_communities` (queda
  `isMover`). **Siguiente hito: M8 · PWA** (Serwist, offline, instalable, push). Mejoras
  futuras de M7 (no bloquean): statements por cron real, `past_due`/`cancelled` automáticos,
  preview del documento KYC en la cola.
- **M6 · Envíos y rastreo — CERRADO.** **M6a — solicitud + ofertas** y **M6b —
  asignación + PIN** (módulo `shipping`): el Seller solicita un envío para un
  pedido `delivery`; los Movers aprobados que operan en la comunidad ofertan →
  `ofertado` (trigger); el solicitante acepta una oferta → `asignado` + **PIN
  hasheado** (S-2) + rechazo de las demás, y el pedido pasa `listo→en_envio`.
  `mover_profiles` enriquecido con `operating_communities` (Pedro opera en Coro +
  Punto Fijo). **M6c.1 — entrega con PIN + consume:** el Mover avanza el viaje y
  entrega validando el PIN (S-3) → envío `entregado`, que **consume el stock
  reservado** (venta real, trigger definer) y mueve el pedido `en_envio→entregado`; el
  comprador confirma → `completado`. **Cierra la salida de M6 y el lazo de inventario
  (`consume`) de M5b.** **M6c.2a — rastreo (pings):** módulo nuevo `tracking`; el
  Mover postea pings de posición (`location_pings` particionada + `geography`/GIST) y
  el comprador ve la última posición. **M6c.2b — push en vivo:** cada ping se publica
  a **Valkey** (pub/sub por envío + GEO) desde `apps/api` y un **WebSocket**
  (`/ws/shipments/:id/track`) lo reenvía al navegador en vivo. Web: panel de envío en
  la ficha de pedido (posición en vivo) + cola/"Mis viajes" en `/mover`
  (avanzar/entregar/compartir ubicación). **M6 CERRADO** salvo pendientes menores:
  vencer ofertas S-1 (worker), cancelar/fallido S-4, auto-cierre 48h, KYC de Movers, y
  un mapa real en la web. **Siguiente hito: M7 · Billing + panel de comunidad.**
- **M5 · Pedido end-to-end — CERRADO (features + infra).** Rebanadas: **M5a**
  carrito, **M5b** estados + reserva, **M5c** pago por comprobante **+ M5c.2 captura**,
  **M5d.1** chat, **M5d.2** reseñas, **M5d.3** preguntas, **M5d.4** reportes, e
  **infra.1** (outbox + vencimiento de reservas I-5) **+ infra.2** (worker runtime +
  Valkey). **M3 · Inventario** cerrado a nivel infra también (el mismo worker).
  **Siguiente hito: M6 · Envíos** (shipping/tracking, WebSockets + GEO; ahí el
  `consume` real de stock del flujo de entrega). Mejora futura del worker (no bloquea):
  particiones mensuales + retención 90 d de `messages` (D-08).
  - **infra.2 — worker + Valkey**: `apps/worker` corre (owner) dos jobs: vencer
    reservas (sweep) y publicar el outbox a Valkey pub/sub. Valkey en docker-compose
    (6380). `drainOutbox`/`sweep…` viven en `@3b/core` (testeables sin broker).
  - **infra.1 — outbox + I-5**: `platform.outbox` + `sweepExpiredReservations`
    (libera reservas vencidas y emite `stock.changed` al outbox).
  - **M5c.2 — captura del pago** (`media_select_payment_proof`): la imagen del
    comprobante que sube el comprador (media propia) se vuelve visible a la tienda vía
    una policy que la enlaza por `payment_reports.proof_media_id`. Web: subida +
    visualización en el panel de pago.
  - **M5d.4 — reportes** (`social.reports`): moderación. Cualquiera que ve la
    comunidad reporta contenido (item/review/question/store, `community_id` derivado
    del target); el admin de la comunidad/plataforma resuelve. Web: "Reportar" en la
    ficha de ítem + cola en `/admin`.
  - **M5d.3 — preguntas públicas** (`social.questions`): Q&A sobre un ítem publicado;
    cualquiera que lo ve pregunta, la tienda responde. RLS: SELECT por comunidad,
    answer = miembro de la tienda. Web: bloque en la ficha de ítem.
  - **M5d.2 — reseñas verificadas** (`social`): módulo nuevo. Al `completado` el
    comprador reseña la **tienda** (rating 1–5 + comentario; una por pedido y
    destinatario, D-04); se publica en el storefront (promedio + conteo). Para llegar
    a `completado` sin M6, se habilita el cierre por **retiro en tienda**
    (`retirado → completado`, el comprador confirma); el genérico suma `retirado`
    (Seller) y `completado` (Maker). RLS: reseña = Maker de un pedido completado;
    visible por comunidad (como descubrimiento). Append-only; `author_name`/
    `community_id` congelados. **Difieren:** preguntas públicas (`questions`),
    `reports`, reseñas a Mover/Maker (con M6), y el `consume` del stock al retirar.
  - **M5d.1 — chat contextual** (`messaging`): módulo nuevo. Hilo de chat **por
    pedido** entre comprador y tienda (`conversations`, una por `(context,
    context_id)`; contexto `order`) + `messages` **particionada por mes** (D-08,
    DDL a mano). API: `GET /v1/orders/{id}/conversation` (crea el hilo perezoso),
    `POST …/messages`, `POST …/conversation/read`. RLS derivada del pedido (sin
    materializar `participants`); mensajes derivan de la conversación padre. Web:
    panel de chat en la ficha del pedido (recibo "Visto"). **Difieren:** otros
    contextos (ítem/envío/tienda), `participants`, y las particiones mensuales +
    retención 90 d (worker).
  - **M5c — pago por comprobante** (`payments`): módulo nuevo. El Maker reporta un
    pago (`payment_reports`, **referencia única** P-1) sobre un pedido `aceptado` →
    `pago_reportado`, congelando `fx_rate_ves` (P-2, tabla `fx_rates`); el Seller lo
    **confirma** (`pago_confirmado`, salida) o **rechaza** (`pago_rechazado`, libera
    la reserva). Las transiciones del pedido las dispara `payments` vía la API
    pública de `orders` (nunca a mano); el endpoint genérico suma `en_preparacion`
    para que el Seller siga de `pago_confirmado` a `listo`. Web: panel de pago en la
    ficha (reportar / confirmar / rechazar) + tasa Bs congelada. **Difieren:** la
    **captura** (`proof_media_id` listo, pero subida + visibilidad media→pedido
    pendientes) y la carga automática de `fx_rates` (hoy por seed).
  - **M5b — máquina de estados + reserva** (`orders` + `inventory.reservations`):
    endpoint `POST /v1/orders/{id}/transition` que valida la arista (§6), reserva
    stock al `aceptado` y lo libera al cancelar, y deja la transición en la bitácora
    inmutable. Nueva tabla `inventory.reservations` con proyección a
    `stock_levels.reserved` por trigger definer (no-sobreventa condicionado). Actor
    por arista en http (Seller = miembro; Maker = dueño; `system` no por API) + RLS
    como candado. Allowlist M5b: `aceptado`/`rechazado`/`listo` (Seller), `cancelado`
    (Maker); web con botonera en la ficha + "Pedidos recibidos" en la tienda.
    **Salida cumplida:** el Seller lleva un pedido hasta `listo`. **Difieren:** las
    aristas de pago (M5c) y de entrega/retiro + el `consumed` (venta real de
    `on_hand`) (M6); el **worker + Valkey** (vencer reservas I-5 + `stock.changed`).
  - **M5a — carrito + checkout** (`orders`): módulo nuevo `orders` (esquema
    `orders.orders`/`order_items`/`order_events` + RLS). El carrito es **del
    cliente** (localStorage, multitienda); cada checkout crea **un pedido por
    tienda** en estado `realizado`, con **título/SKU/precio congelados** (O-1),
    snapshot de dirección y `Idempotency-Key` (O-4, único por Maker). `community_id`
    se toma de la tienda (D-05); `number` correlativo (identity). API: `POST
    /v1/orders` (201/200 idempotente), `GET /v1/orders` (míos), `GET
    /v1/orders/{id}`, `GET /v1/stores/{id}/orders` (recibidos, miembros). Web:
    "Agregar al carrito" en la ficha, carrito/checkout (`/comprar/carrito`), "Mis
    pedidos" (`/comprar/pedidos`). **Difieren**: máquina de estados + reserva de
    stock (M5b), pago por comprobante (M5c), chat/reseñas (M5d).
  - **M3 r1 — existencias + movimientos** (`inventory.stock_levels` proyección +
    `inventory.stock_movements` libro de solo inserción; trigger de proyección con
    no-sobreventa; idempotencia; mostrador/ajustes por API y web). **Difieren**:
    reservas (`reservations`, atadas a pedidos/M5) y el **worker + Valkey** (pub/sub,
    vencimiento, `stock.changed`) — necesitan la infra del worker, aún no encendida.
  - **M4 r1 — descubrimiento (feed + búsqueda de ítems)**: endpoint público
    `GET /v1/discovery/items` (solo publicados, por comunidad visible), full-text
    `search_tsv` (español, **sin acentos** vía `f_unaccent` immutable) + GIN +
    pg_trgm (tipeos), filtros `q`/`kind`/`categoría`/comunidad, paginación; página
    **Comprar** con buscador.
  - **M4 r2 — ficha pública de ítem**: `GET /v1/discovery/items/{id}` (ítem +
    tienda + comunidad + imágenes + variantes **con disponibilidad** + detalle de
    servicio). Policies de descubrimiento: **imágenes** (`media_select_item`) y
    **disponibilidad** (`stock_levels_select_public`) visibles a quien ve el ítem
    (antes stock era solo-miembros). Página `/comprar/[id]`; el feed enlaza a ella.
  - **M4 r3 — ficha pública de tienda (storefront)**: `GET /v1/discovery/stores/{id}`
    (cabecera + verificada + horario + ítems publicados; reusa `searchItems` con
    filtro `storeId`). Página `/comprar/tienda/[id]`; la ficha de ítem enlaza al
    storefront.
  - **M4 r4 — filtros por atributo (facetas)**: proyección `catalog.item_attr_index`
    (una fila por `key`, mantenida por trigger desde `items.attributes`); el feed
    acepta `attrs=key:value;…` (AND, match exacto) y `GET /v1/discovery/facets`
    devuelve valores disponibles con conteo (dinámicos, solo publicados). Página
    Comprar con panel de facetas toggleable.
  - **M4 r5 — cercanía (vecinas) + orden local-first**: el feed ordena por
    proximidad (comunidad propia → vecina vía `community_links` → otra), luego
    relevancia/recencia, usando las membresías del usuario (CTE bajo RLS). Satisface
    "(y vecinas)" y el "ranking básico". **Difiere**: `ranking.item_scores`
    (proyección con conversión/calidad) hasta **post-M5** (necesita pedidos/reseñas).
  - **M4 cerrado** (salvo esa proyección). **M5 cerrado** (features + infra; ver
    arriba). La proyección de ranking con señales de comportamiento ya tiene insumos
    (pedidos + reseñas) para cuando se retome post-M5.
- **M2 (cerrado) · Tienda + Catálogo + núcleo de media**, por rebanadas
  verticales siguiendo `data-model.md §7`. HECHAS: **store 1 (alta)**, **2
  (equipo/roles)**, **3 (métodos de pago)**, **4 (horarios)**, **5 (KYC/
  verificación)**, **núcleo de `media` (backend)**, **catalog 1 (ítems)**, **2a
  (categorías)**, **2b (atributos: definiciones + herencia)**, **2c (valores de
  atributo en ítems)**, **2d (variantes)**, **2e (detalle de servicio)** y **2f
  (colecciones/vitrina)**. Catalog queda con su núcleo completo (taxonomía,
  atributos, ítems con valores, variantes, detalle de servicio, colecciones) **+
  página de detalle de ítem**; store suma **horario semanal**, **colecciones** y
  **verificación KYC** (con `stores.verification_level` + revisión por admin de
  comunidad). Trabajo autónomo en curso contra el mapa de datos de `.docs`
  (`3B_diccionario_de_objetos.md`, 62 entidades/14 dominios): se avanza fase por
  fase creando todos los objetos. Diseño visual: **se difiere** (habrá un skill de
  UI). Quedan del mapa M2: `templates` (plantillas de atributos), `item_attr_index`
  (proyección de búsqueda, va con M4), KYC de **movers** (M6) y los de Fase 2
  (`changesets`).
- **Localhost demo:** `pnpm db:up` + `pnpm --filter @3b/api dev` (8787) +
  `pnpm --filter @3b/web dev` (3000); opcional `pnpm --filter @3b/worker dev`
  (vence reservas + publica a Valkey). Usuarios seed, password `Password123!`
  (carlos@3b.test = Seller con 2 tiendas e ítems; admin@3b.test = superadmin +
  "Ver como"). **Ojo:** `pnpm test:integration` resetea la DB (desloguea); re-seed
  con `pnpm db:reset` para el demo.
- **Entorno:** Docker: Postgres puerto **5433** (el 5432 es un Postgres nativo) +
  **Valkey** puerto **6380**. `pnpm check` debe quedar verde; `pnpm test:integration`
  corre RLS/RBAC contra DB real. CI en GitHub Actions valida ambos en cada push/PR a
  `main`.
- **Git:** commits **directos a `main`** (dev extra: Raphaelofwar). Un commit por
  unidad lógica; cada uno con su entrada en este DDR.

---

## 2026-11-07 · _(este commit)_ · feat — M8c.1: cola offline (Background Sync) + helper de mutaciones

- **Qué:** las mutaciones hechas **sin conexión** ya no se pierden: el service worker las
  **encola** y las **reenvía al reconectar** (Background Sync), y el flujo de pedidos avisa al
  usuario que la acción quedó pendiente. Primera rebanada del alcance elegido ("cola + helper
  central"); la migración del resto de los flujos es M8c.2.
- **Por qué:** roadmap M8 ("cola offline / Background Sync"). Sin esto, una acción offline
  rechazaba el `fetch` y dejaba la UI colgada sin feedback. Las mutaciones salen de ~20
  componentes con `fetch('/v1/...')` inline; se centralizan en un helper para dar feedback
  consistente y adjuntar `Idempotency-Key`.
- **Impacto / archivos (solo `apps/web`):**
  - `app/sw.ts`: `BackgroundSyncPlugin('mutations-v1', { maxRetentionTime: 1 día, onSync })` +
    una entrada `RuntimeCaching` por verbo de escritura (POST/PUT/PATCH/DELETE, `NetworkOnly`,
    misma cola). `onSync` reenvía (`replayRequests`) y hace `postMessage({type:'mutations-synced'})`
    a las pestañas. `runtimeCaching = [...apiCache, ...mutationCache, ...defaultCache]`.
  - `lib/mutate.ts` (`mutate()`): helper cliente que devuelve `ok` | `queued` | `error`
    (`queued` cuando el `fetch` rechaza y `navigator.onLine` es false → el SW ya encoló) y
    agrega `Idempotency-Key`. Solo cliente (fetch relativo same-origin).
  - `app/_components/order-actions.tsx`: usa `mutate()`; muestra "Sin conexión: la acción se
    enviará al reconectar" cuando queda encolada. **Integración de referencia.**
  - `app/_components/sync-listener.tsx` (`SyncListener`) + `app/(shell)/layout.tsx`: escucha
    `mutations-synced` del SW y hace `router.refresh()` para reflejar lo ya aplicado.
- **Decisiones de diseño:**
  - **Una cola para todos los verbos:** reenvío en orden; `RuntimeCaching.method` es un solo
    método, por eso una entrada por verbo compartiendo el mismo `BackgroundSyncPlugin`.
  - **No corto por `navigator.onLine` antes del fetch:** hay que dejar que la request llegue al
    SW para que la encole; recién en el `catch` distingo `queued` (offline) de `error`.
  - **`Idempotency-Key` en toda mutación:** forward-compatible (hoy solo lo honra la creación de
    pedidos); el resto de los duplicados en reenvío los frenan constraints del server.
- **Verificación:** `pnpm check` **verde** (lint sin errores, typecheck 10/10, unit 19/19,
  boundaries 675 módulos). `next build` OK (Serwist: 30 entradas de precache). Smoke en
  `next start`: el `/serwist/sw.js` servido contiene `mutations-v1`, `replayRequests`,
  `maxRetentionTime` y `mutations-synced` (el nombre de clase `BackgroundSync` se minifica).
- **Estado para retomar:** **M8c.1 cerrado.** Siguiente: **M8c.2** — migrar los demás flujos de
  mutación a `mutate()` (pagos, chat, reseñas, preguntas, reportes, envíos/mover, KYC, tienda/
  catálogo, impersonate). Nota: las subidas con `FormData` (media) no pasan por el helper (cuerpo
  no-JSON; su offline queda fuera de alcance). Luego M8d (push VAPID) y M8e (presupuesto).
- **Relacionado:** ROADMAP M8; entradas M8a/M8b; decisión de alcance "cola + helper central".

## 2026-11-07 · _(este commit)_ · feat — M8b: PWA offline resiliente (caché de /v1 + indicador de conexión)

- **Qué:** el service worker ahora **cachea las lecturas del BFF** para tolerar cortes, y el
  shell muestra un **indicador de conexión** cuando se cae la red.
- **Por qué:** roadmap M8 (PWA tolerante a cortes). Con solo el fallback a `/~offline` (M8a), una
  navegación sin red perdía todo; cacheando los GETs de `/v1` el usuario sigue viendo lo último
  consultado, y el indicador explica por qué los datos pueden estar guardados.
- **Impacto / archivos (solo `apps/web`):**
  - `app/sw.ts`: `runtimeCaching = [...apiCache, ...defaultCache]` (gana la primera regla que
    matchea). `apiCache`: (1) `/api/auth` → **NetworkOnly** (nunca cachear la sesión);
    (2) GET `/v1/*` → **NetworkFirst** (`cacheName: 'api-v1'`, `networkTimeoutSeconds: 3`,
    `CacheableResponsePlugin [200]`, `ExpirationPlugin` 128 entradas / 1 día). Las mutaciones
    (POST/PATCH) no matchean (solo GET) → van directo a la red (su cola offline es M8c).
  - `app/_components/connection-status.tsx` (`ConnectionStatus`): client component que escucha
    `online`/`offline`; barra ámbar (`bg-accent`) que entra/sale con los tokens de motion
    (grid-rows 0fr→1fr, `ease-standard`, `--duration-base`); región `aria-live` que se anuncia.
  - `app/(shell)/layout.tsx`: monta `<ConnectionStatus />` arriba del todo.
- **Decisiones de diseño:**
  - **NetworkFirst (no StaleWhileRevalidate) para `/v1`:** online siempre fresco; offline cae a
    lo último visto. El timeout de 3 s también degrada rápido en redes lentas.
  - **NetworkOnly para `/api/auth`:** la sesión nunca debe servirse de caché.
  - **Solo se cachea 200:** un 401 (p. ej. tras logout) no pisa el dato cacheado.
- **Verificación:** `pnpm check` **verde** (lint sin errores, typecheck 10/10, unit 19/19,
  boundaries 673 módulos). `next build` OK (Serwist: 30 entradas de precache; SW por esbuild).
  Smoke en `next start`: el `/serwist/sw.js` servido contiene `api-v1`, los matchers `/v1` y
  `/api/auth`, el fallback `/~offline` y `networkTimeout` → las reglas quedaron embebidas.
- **Estado para retomar:** **M8b cerrado.** Siguiente: **M8c — cola offline (Background Sync)**
  para reintentar mutaciones POST/PATCH al reconectar (Serwist exporta `BackgroundSyncQueue`).
  Luego M8d (push VAPID) y M8e (presupuesto de rendimiento). Mejora futura: purgar la caché
  `api-v1` al cerrar sesión (hoy una lectura vieja podría verse offline tras logout).
- **Relacionado:** ROADMAP M8; entrada M8a; CLAUDE.md (apps/web, motion).

## 2026-11-07 · _(este commit)_ · feat — M8a: PWA instalable (Serwist/Turbopack + manifest + offline)

- **Qué:** la app web es **instalable** y abre **offline**. Service worker con precache +
  runtime caching (`@serwist/turbopack`), `manifest.webmanifest`, íconos generados por código
  (sin binarios), `viewport`/`themeColor` + meta apple, registro del SW y página de reserva
  `/~offline`. **Arranca M8.**
- **Por qué:** roadmap M8 (PWA): base instalable + tolerante a cortes. Next 16 compila con
  **Turbopack** por defecto, lo que descarta el plugin de webpack de `@serwist/next`; el camino
  correcto es **`@serwist/turbopack`** (el SW se construye por un Route Handler con esbuild).
- **Impacto / archivos (solo `apps/web`):**
  - `next.config.ts`: envuelto con `withSerwist`.
  - `app/serwist/[path]/route.ts`: `createSerwistRoute({ swSrc: 'app/sw.ts', useNativeEsbuild,
    additionalPrecacheEntries: [/~offline] })` — sirve `/serwist/sw.js`.
  - `app/sw.ts`: `Serwist` con `defaultCache` (de `@serwist/turbopack/worker`), `skipWaiting`,
    `clientsClaim`, `navigationPreload` y **fallback** de documento a `/~offline`.
  - `app/manifest.ts`: manifest (crema `#f4f2e0` fondo+tema, `display: standalone`, `lang es`).
  - `lib/pwa-icon.tsx` + `app/icon.tsx` + `app/apple-icon.tsx` + `app/icons/[icon]/route.tsx`:
    íconos "3B" (verde sobre crema) vía `ImageResponse` (192/512/maskable + favicon + apple).
  - `app/layout.tsx`: `metadata.appleWebApp`, `viewport.themeColor`, y `<SerwistProvider
    swUrl="/serwist/sw.js" disable={dev}>` (SW desactivado en dev para no chocar con el HMR).
  - `app/~offline/page.tsx` (+ `offline-retry.tsx`): página estática fuera de `(shell)` (el
    layout del shell hace `getMe()`/red), precacheada por el SW.
  - deps dev: `@serwist/turbopack`, `serwist`, `esbuild`.
- **Decisiones de diseño:**
  - **`@serwist/turbopack` (no `@serwist/next`):** compatible con el build Turbopack de Next 16
    (el plugin webpack de `@serwist/next` bloquea ese build). El SW se bundlea con esbuild nativo.
  - **Íconos por código (`ImageResponse`):** sin assets binarios; re-tematizables; el pulido
    visual real queda diferido a **M9**.
  - **theme_color = crema:** barra del SO al tono del fondo de marca (look a sangre / glass).
- **Verificación:** `pnpm check` **verde** (lint sin errores, typecheck 10/10, unit 19/19,
  boundaries 672 módulos). `next build` OK (Serwist: **30 entradas de precache**; SW por
  esbuild). Smoke en `next start`: `/manifest.webmanifest` (application/manifest+json),
  `/serwist/sw.js` (application/javascript), `/icons/{192,512,maskable}.png` + `/apple-icon`
  (image/png) y `/~offline` → **200**.
- **Estado para retomar:** **M8a cerrado.** Siguiente: **M8b — offline resiliente** (caché de
  GETs de `/v1` + indicador de conexión en el shell). Luego M8c (cola offline / Background
  Sync), M8d (push VAPID: tabla + API + worker + permiso) y M8e (presupuesto de rendimiento).
  Nota: el SW se verifica con `next build` (en dev está `disable`).
- **Relacionado:** ROADMAP M8; CLAUDE.md (apps/web).

## 2026-11-04 · _(este commit)_ · feat — M7d.3: métricas de comunidad (cierra M7)

- **Qué:** tablero de **métricas** en el panel de comunidad: tiendas, Movers aprobados que
  operan ahí, pedidos, **GMV** (ventas completadas), cobros pendientes y reportes abiertos de
  la comunidad. Endpoint `GET /communities/{id}/metrics`. **Cierra M7.**
- **Por qué:** completa el panel de comunidad (roadmap M7: "métricas") y le da al admin una
  foto de su comunidad.
- **Impacto / archivos:**
  - `packages/contracts/src/identity.ts` (+export): `CommunityMetrics`.
  - `packages/db/migrations/0039_community_metrics.sql` (**migración manual**, sin cambio de
    schema Drizzle): función `identity.community_metrics(cid)` **SECURITY DEFINER
    auto-guardada** — agrega conteos cross-schema bypasseando RLS, pero solo devuelve filas si
    el que consulta es admin de la comunidad / plataforma (`REVOKE` de PUBLIC + `GRANT` a
    `app`). + entrada en `_journal.json` y snapshot `0039`.
  - `packages/core/src/modules/identity/`: `infra/metrics-repo.ts` (`getCommunityMetrics`,
    null si sin acceso) + ruta `GET /communities/{id}/metrics` (gate `isCommunityAdmin`).
  - `apps/web`: `lib/community.ts` (`getCommunityMetrics`), `CommunityMetricsTiles` + tablero
    por comunidad en `/comunidad`.
- **Decisiones de diseño:**
  - **Función definer auto-guardada (no RLS por fila):** las métricas necesitan contar filas
    que la RLS le oculta al admin de comunidad (mover_profiles/orders ajenos). La función
    (owner) bypassa RLS para los conteos, pero se auto-guarda con `authz.is_community_admin`
    (lee `app.user_id` del contexto) → solo el admin obtiene datos, y solo agregados.
  - **Migración manual (solo función):** sin cambio de schema Drizzle; el `.sql` + journal +
    snapshot se agregaron a mano (patrón para DDL puro).
- **Verificación:** `pnpm check` **verde** (lint, typecheck, unit 19/19, boundaries **430
  módulos**). `pnpm test:integration`: db 6/6 + **core 131/131** (+3 de M7d.3: el admin de
  comunidad y el de plataforma obtienen conteos; un miembro no-admin obtiene `null`).
- **Estado para retomar:** **M7 CERRADO** (billing + panel de comunidad). Siguiente hito:
  **M8 · PWA** (Serwist, offline, instalable, push). Mejoras futuras de M7 (no bloquean):
  generación de statements por cron real, `past_due`/`cancelled` automáticos, preview del
  documento KYC en la cola, y métricas con series temporales.
- **Relacionado:** ROADMAP M7; entradas de M7d.1, M7d.2.

## 2026-11-04 · _(este commit)_ · feat — M7d.2: KYC + aprobación de Movers

- **Qué:** un usuario se postula como **Mover** en una comunidad
  (`POST /me/mover/applications`): crea su perfil `pending` y envía una verificación (KYC de
  sujeto `mover`) a esa comunidad. El admin de la comunidad la ve en su cola y la aprueba → el
  perfil pasa a `approved` + la comunidad se suma a `operating_communities` (el usuario queda
  `isMover`), vía el trigger de KYC. Web: postulación en `/mover` (para no-Movers) + la cola de
  `/comunidad` ahora muestra Movers.
- **Por qué:** faltaba el alta/aprobación de Movers (hasta ahora Pedro era Mover solo por seed;
  `isMover` no se podía obtener por la app). Completa la verificación de Movers de M7d.
- **Impacto / archivos:**
  - `packages/contracts/src/identity.ts` (+exports): `KycSubmission.communityId`, `MoverStatus`,
    `ApplyMoverInput`.
  - `packages/db/src/schema/identity.ts` (+migración `0038_slim_onslaught.sql`):
    `kyc_submissions.community_id` (FK blanda a community + índice). RLS del caso `mover`
    (select/insert/update: el Mover crea/ve lo suyo, el admin de la comunidad objetivo revisa) +
    **trigger `tg_kyc_apply_verification` extendido**: al aprobar un KYC de Mover hace upsert de
    `mover_profiles` (`approved` + `array_append` de la comunidad, dedupe).
  - `packages/core/src/modules/identity/`: `applyAsMover` (perfil `pending` + submission),
    `listMyMoverApplications`, `listPendingByCommunity` (tiendas **+ Movers**),
    `getReviewCommunity` (mover → `kyc.community_id`), `createSubmission(+communityId)`; rutas
    `POST`/`GET /me/mover/applications`.
  - `apps/web`: `lib/community.ts` (`getMyMoverApplications`), `MoverApply` (postulación en
    `/mover` para no-Movers), navbar ("Convertite en Mover"), `/comunidad` + `KycReviewQueue`
    muestran Movers.
- **Decisiones de diseño:**
  - **Comunidad objetivo en la verificación (no en el perfil):** el Mover opera en varias
    comunidades; cada postulación apunta a una (`kyc.community_id`), lo que gatea al revisor
    (admin de ESA comunidad) y al aprobar suma esa comunidad a `operating_communities`.
  - **Aprobación por trigger definer:** la app no hace UPDATE de `mover_profiles` (sigue
    platform-only por RLS); el trigger de KYC (SECURITY DEFINER) hace el upsert al aprobar.
    Rechazar deja el perfil `pending` (reintento).
  - **RLS aditiva por sujeto:** las policies de `mover` se suman (OR) a las de `store` de M2;
    `community_id` es NULL para store y seteado para mover.
- **Verificación:** `pnpm check` **verde** (lint, typecheck, unit 19/19, boundaries **427
  módulos**). `pnpm test:integration`: db 6/6 + **core 128/128** (+1 de M7d.2: MARTA se postula
  en Coro, segunda postulación `already_pending`, ANA la ve en la cola y la aprueba → MARTA
  `isMover` + Coro en operating_communities; RLS: el postulante no se auto-aprueba).
- **Estado para retomar:** **M7d.3 — métricas de comunidad** (endpoint + tablero: conteos de
  tiendas, Movers, pedidos, GMV, cobros, reportes por comunidad). Mejora futura: preview del
  documento KYC en la cola (la policy `media_select_kyc` ya le da acceso al revisor).
- **Relacionado:** ROADMAP M7; entradas de M7d.1, M2 (KYC tienda), M6 (operating_communities).

## 2026-11-04 · _(este commit)_ · feat — M7d.1: panel de comunidad (shell + colas RLS-scoped)

- **Qué:** arranca **M7d**. Página `/comunidad` para **admins de comunidad**
  (`me.communities` con `role='admin'`) + link en el navbar. Reúne, acotado por la RLS a
  su(s) comunidad(es): la cola de **verificaciones (KYC) de tienda** (aprobar/rechazar),
  los **cobros por confirmar** y los **reportes** abiertos. Reusa el backend existente
  (sin cambios de servidor).
- **Por qué:** da al admin de comunidad su propio panel (hasta ahora solo existía el de
  plataforma en `/admin`); las acciones ya las soportaba la RLS, faltaba la UI.
- **Impacto / archivos:**
  - `apps/web/lib/community.ts` (nuevo): `getCommunityKyc(communityId)` →
    `GET /v1/communities/{id}/kyc`.
  - `apps/web/app/_components/kyc-review-queue.tsx` (nuevo): cola de verificaciones;
    aprobar/rechazar vía `POST /v1/kyc/{id}/review`.
  - `apps/web/app/(shell)/comunidad/page.tsx` (nuevo): gate a admins de comunidad; KYC por
    comunidad (con nombre de tienda resuelto) + cobros (`CollectionsQueue`) + reportes
    (`ReportsQueue`).
  - `apps/web/app/_components/navbar.tsx`: link **Comunidad** si el usuario admina ≥1
    comunidad.
- **Decisiones de diseño:**
  - **Reuso del backend RLS-scoped:** `GET /communities/{id}/kyc`, `GET /me/collections` y
    `GET /reports?status=open` ya acotan por la comunidad del admin; el panel solo compone
    la UI. Sin endpoints nuevos.
  - **Separación plataforma/comunidad:** `/admin` (plataforma, ve todo) vs `/comunidad`
    (acotado a la comunidad del admin). Un admin de plataforma que no es admin de comunidad
    no ve `/comunidad`.
  - **Documento KYC sin preview por ahora:** la cola muestra tienda + tipo de doc + si
    adjuntó documento; la previsualización del archivo (visibilidad media→revisor) queda
    para después.
- **Verificación:** `pnpm check` **verde** (lint, typecheck, unit 19/19, boundaries
  **425 módulos**). Sin cambios de backend → los tests de integración existentes cubren las
  rutas reusadas (kyc.test, billing-collections, reportes).
- **Estado para retomar:** **M7d.2 — KYC + aprobación de Movers** (el enum `mover` existe
  pero RLS/rutas solo cubren `store`): alta de KYC de Mover, derivación de comunidad vía
  `operating_communities`, revisión por el admin de comunidad y trigger de aprobación que
  pone `mover_profiles.status='approved'` (→ `isMover`). Luego **M7d.3 — métricas**.
- **Relacionado:** ROADMAP M7; entradas de M7c.2 (cobros), M5d.4 (reportes), M2 (KYC tienda).

## 2026-11-04 · _(este commit)_ · feat — M7c.2: billing — cobro de estados de cuenta por comprobante (D-03)

- **Qué:** cierra **M7c**. El **sujeto** (tienda/Mover) reporta el pago de un estado de
  cuenta `open` por **comprobante** (reusando M5c); el estado pasa `open→pending` y un
  **admin** confirma el cobro (`pending→paid`) o lo rechaza (vuelve a `open`). Web: el
  sujeto reporta desde `mi-tienda`/`/mover`; el admin confirma en `/admin` ("Cobros por
  confirmar").
- **Por qué:** cierra el lazo de billing (devengado → facturado → cobrado) con trazabilidad
  del cobro (referencia + revisor).
- **Impacto / archivos:**
  - `packages/db/src/schema/payments.ts` (+migración `0037_sudden_shinko_yamashiro.sql`,
    **D-03**): `payment_reports.order_id` **nullable** + `statement_id` (FK `statements`) +
    CHECK (exactamente uno) + índice. RLS del caso statement (SELECT/INSERT del sujeto;
    UPDATE del admin) sumada a las de pedido (OR de policies). **2 triggers definer**
    (billing escucha a payments): al reportar → `open→pending`; al revisar → `paid`
    (confirmar) o `open` (rechazar).
  - `packages/contracts/src/payments.ts`: `PaymentReport.orderId` nullable + `statementId`.
  - `packages/core/src/modules/payments/`: `reportStatementPayment`, `reviewStatementPayment`,
    `listPaymentsForStatement` (+`referenceTaken` DRY) + rutas `POST/GET /statements/{id}/
    payments` y `.../{paymentId}/review`.
  - `packages/core/src/modules/billing/`: `listPendingStatements` + ruta `GET /me/collections`.
  - `apps/web`: `StatementReport` (sujeto reporta en `open`), `CollectionsQueue` (admin
    confirma/rechaza en `/admin`), fetchers en `lib/billing.ts`.
- **Decisiones de diseño:**
  - **Reuso de `payment_reports` (D-03), no tabla nueva:** el comprobante es el mismo objeto
    (método + referencia única P-1 + monto + revisor); referencia polimórfica a pedido **o**
    estado de cuenta (CHECK de exactamente uno).
  - **Transiciones del estado de cuenta por triggers definer:** billing "escucha" a payments
    (como escucha a orders/shipments en M7b); `app` nunca hace UPDATE directo de `statements`
    (sigue SELECT-only). Idempotente por los guards de estado.
  - **Confirma el admin (no el Seller):** a diferencia del pago de pedido (lo confirma la
    tienda), el cobro de la plataforma lo confirma un **admin** (de la comunidad del estado
    de cuenta, o de plataforma para Movers). La RLS es el candado.
- **Verificación:** `pnpm check` **verde** (lint, typecheck, unit 19/19, boundaries
  **422 módulos**). `pnpm test:integration`: db 6/6 + **core 127/127** (+1 de M7c.2: sujeto
  dedicado — reporta→pending, admin rechaza→open, reporta→confirma→paid; RLS: un tercero no
  reporta ni ve, el sujeto no confirma su propio cobro).
- **Estado para retomar:** **M7c completo** (estados de cuenta + cobro por comprobante).
  Siguiente: **M7d — panel de comunidad** (KYC de Movers, cobros por comunidad, reportes,
  métricas); la confirmación de cobros por el **admin de comunidad** (hoy en `/admin`, de
  plataforma) se integra ahí. Pendientes menores de M7: disparar la generación de statements
  por cron real (hoy el worker la corre por intervalo) y `past_due`/`cancelled` automáticos.
- **Relacionado:** ROADMAP M7, `data-model.md` §2.5 (statements) · §9 (D-03); entradas de
  M7c.1, M7a/M7b, M5c.

## 2026-11-04 · _(este commit)_ · feat — M7c.1: billing — estados de cuenta (`statements`)

- **Qué:** tercera rebanada de **M7** (lectura). Un **job del worker** genera estados de
  cuenta **mensuales** por sujeto (`statements`, polimórfico `store`|`mover`): suma la
  cuota de suscripción del período (0 para Movers y tiendas en `trial`/`cancelled`) + las
  comisiones devengadas (`fee_accruals`) del mes. Web: lista de estados de cuenta en
  `mi-tienda` y `/mover`.
- **Por qué:** cumple "estados de cuenta mensuales" de M7; consolida lo devengado (M7b)
  en un documento por período, base del **cobro por comprobante** (M7c.2).
- **Impacto / archivos:**
  - `packages/contracts/src/billing.ts` (+exports): `StatementStatus`, `Statement`,
    `StatementList`.
  - `packages/db/src/schema/billing.ts` (+migración `0036_mixed_paper_doll.sql`):
    `statements` (sujeto polimórfico; `period` `YYYY-MM`; `subscription_amount` +
    `commission_amount` → `total`; `status` open|pending|paid; `community_id` NULL para
    Movers; `unique(subject_type, subject_id, period)`). CHECKs + RLS/grants (solo lectura
    para `app`; la ve el sujeto o un admin) + **función SECURITY DEFINER**
    `billing.generate_statements(period)` (owner; agrega por sujeto con upsert que **solo
    pisa filas `open`**; `REVOKE … FROM PUBLIC`).
  - `packages/core/src/modules/billing/`: `infra/billing-repo.ts` (`listStatements`,
    `getStatement`, `generateStatements`), rutas `GET /stores/{id}/statements`,
    `GET /me/statements`, `GET /statements/{id}`; exports en `index.ts`.
  - `packages/config/src/env.ts` (+`WORKER_STATEMENT_INTERVAL_MS`, default 6 h) +
    `apps/worker/src/index.ts`: loop que genera el mes en curso + el anterior.
  - `apps/web`: `lib/billing.ts` (`getStoreStatements`/`getMyStatements`, labels,
    `formatPeriod`), componente `_components/statements.tsx`, listados en `mi-tienda` y
    `/mover`.
- **Decisiones de diseño:**
  - **Generación por job owner (no por trigger):** a diferencia del devengo (M7b,
    triggers), el estado de cuenta es un corte **temporal** (mensual) → lo corre el worker
    con la conexión owner. Idempotente: el upsert solo **refresca filas `open`** (no pisa
    `pending`/`paid`). El worker regenera el mes en curso (lo mantiene al día) y el
    anterior (lo finaliza).
  - **`community_id` NULL para Movers:** el billing de Movers es de **plataforma** (un
    Mover opera en varias comunidades); su estado de cuenta solo lo ve el Mover o un admin
    de plataforma. El de tienda lleva su `community_id` (lo ve el admin de comunidad).
  - **`statements` polimórfico (coherente con `fee_accruals`):** mismo `subject_type`/
    `subject_id`; el total de tienda incluye suscripción, el de Mover solo comisiones.
- **Verificación:** `pnpm check` **verde** (lint, typecheck, unit 19/19, boundaries
  **419 módulos**). `pnpm test:integration`: db 6/6 + **core 126/126** (+2 de M7c.1:
  generación + RLS del estado de cuenta de tienda (tercero no ve, admin sí) y de Mover
  (sin suscripción, sin comunidad; tienda ajena no ve)).
- **Estado para retomar:** **M7c.2 — cobro por comprobante** (D-03): ALTER
  `payment_reports` (`order_id` nullable + `statement_id` + CHECK exactamente uno), reusar
  el flujo de M5c para reportar el pago de un estado de cuenta (`open→pending`) y que el
  **admin confirme el cobro** (`pending→paid`). Luego **M7d** panel de comunidad (KYC +
  cobros + reportes + métricas).
- **Relacionado:** ROADMAP M7, `data-model.md` §2.5 (statements), §9 (D-03); entradas de
  M7a/M7b.

## 2026-11-03 · _(este commit)_ · feat — M7b: billing — comisiones devengadas (`fee_accruals`)

- **Qué:** segunda rebanada de **M7**. Al `completado` de un pedido se **devenga una
  comisión de venta** a la tienda (`total × commission_rate`, grabada además en
  `orders.fee_amount`); al `entregado` de un envío se devenga una **comisión de envío**
  al **Mover** (`agreed_price × rate`, S-3). `fee_accruals` es **polimórfico por sujeto
  (`store`|`mover`)**, solo inserción. La tasa es **% por env** (`COMMISSION_RATE`),
  cargada en `billing.config` por el seed; los triggers la leen de ahí. Web:
  comisiones devengadas en `mi-tienda` y en `/mover`.
- **Por qué:** cumple "comisiones devengadas" de M7 y conecta billing con los hitos de
  pedido (O-3) y envío (S-3); alimenta los estados de cuenta (M7c).
- **Impacto / archivos:**
  - `packages/config/src/env.ts` (+`.env.example`): `COMMISSION_RATE` (default 0.05).
  - `packages/contracts/src/billing.ts` (+exports): `FeeSubjectType`, `FeeKind`,
    `FeeAccrual`, `FeeAccrualList`.
  - `packages/db/src/schema/billing.ts` (+migración `0035_flashy_punisher.sql`):
    `config` (clave/valor, owner-only) + `fee_accruals` (sujeto polimórfico;
    `unique(order_id)` y `unique(shipment_id)` — NULL no colisiona). CHECKs + RLS/grants
    (solo lectura para `app`; la ve el sujeto o un admin) + **2 triggers definer**:
    `tg_accrue_sale` (BEFORE UPDATE en `orders`, al `completado`: setea `fee_amount` +
    inserta la comisión de venta) y `tg_accrue_shipment` (AFTER UPDATE en `shipments`,
    al `entregado`: comisión del Mover). Seed: `commission_rate` desde env.
  - `packages/core/src/modules/billing/`: `infra/billing-repo.ts` (`listFeeAccruals`
    —suma el total en centavos—), rutas `GET /stores/{id}/fee-accruals` y
    `GET /me/fee-accruals` (Mover).
  - `apps/web`: `lib/billing.ts` (`getStoreFeeAccruals`/`getMyFeeAccruals`), total en
    `mi-tienda` y `/mover`.
- **Decisiones de diseño:**
  - **Devengo por triggers definer (billing escucha, sin acoplar):** la venta la
    dispara el pedido al `completado`; el envío, la entrega. Billing "escucha" por
    trigger (no `orders/shipping → billing`). Una comisión por pedido/envío (unique +
    guard de transición → idempotente).
  - **Tasa por env en la DB:** el % vive en `billing.config` (sembrado desde
    `COMMISSION_RATE`), para que los triggers (SQL) la lean sin leer env; cambiarla =
    re-seed o `UPDATE` del admin.
  - **`fee_accruals` polimórfico:** generaliza el `store_id` del modelo a
    `subject_type`+`subject_id` para soportar también a los Movers (decisión del hito).
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit 19/19,
  boundaries **417 módulos**). `pnpm test:integration`: db 6/6 + **core 124/124** (+2
  de M7b: venta→comisión a la tienda + `fee_amount` + RLS (tercero no ve, admin sí);
  envío→comisión al Mover). El trigger de venta (BEFORE UPDATE global en `orders`) no
  rompió ningún test.
- **Estado para retomar:** **M7c — estados de cuenta** (`statements` por tienda/Mover:
  suscripción + comisiones del período; **pago por comprobante** reusando M5c vía
  `statement_id` (D-03: ALTER `payment_reports`); el admin confirma el cobro).
  Generación mensual = job del worker. Luego **M7d** panel de comunidad.
- **Relacionado:** ROADMAP M7, `data-model.md` §2.5 (fee_accruals), §5 (O-3/S-3);
  entrada de M7a.

## 2026-11-03 · `cd5f74a` · feat — M7a: billing — planes + suscripciones (módulo `billing`)

- **Qué:** arranca **M7 · Billing**. Módulo nuevo `billing`: tabla `plans`
  (`seller_products`/`seller_services`, precio mensual, lectura pública) y
  `subscriptions` (**una por tienda**). Cada tienda **nace en `trial`** (30 días) con
  el plan según su `kind`, vía un **trigger definer**; un **admin** (de comunidad o
  plataforma) la activa/cambia. Web: estado de la suscripción en `mi-tienda`.
- **Por qué:** es la base de M7 (las comisiones y los estados de cuenta cuelgan de
  acá). Decisiones del arranque: empezar por planes+suscripciones, **comisión % por
  env** (M7b), y **billing de Movers desde M7b** → `fee_accruals`/`statements` nacerán
  polimórficos por sujeto (`store`|`mover`).
- **Impacto / archivos:**
  - `packages/contracts/src/billing.ts` (+exports): `PlanCode`, `Plan`, `PlanList`,
    `SubscriptionStatus`, `Subscription`, `SetSubscriptionInput`.
  - `packages/db/src/schema/billing.ts` (+`index.ts`, +`reset.ts`): `plans` +
    `subscriptions` (`unique(store_id)`). Migración `0034_crazy_silver_centurion.sql`:
    tablas + CHECKs + RLS/grants (`plans` lectura pública; `subscriptions` la ve el
    equipo de la tienda o un admin, la **cambia** solo un admin) + **trigger
    `stores_trial_subscription`** (SECURITY DEFINER: billing escucha a store sin
    acoplar store→billing). Seed: 2 planes (10/8 USD) **antes** de las tiendas.
  - `packages/core/src/modules/billing/`: `infra/billing-repo.ts` (`listPlans`,
    `getSubscription`, `setSubscription`), `http/routes.ts` (`GET /plans`,
    `GET/POST /stores/{id}/subscription`), `index.ts`. `apps/api` monta
    `billingRouter()`; `@3b/core` exporta `./modules/billing`.
  - `apps/web`: `lib/billing.ts` (`getSubscription`), sección de suscripción en
    `mi-tienda/[id]`.
- **Decisiones de diseño:**
  - **`trial` por trigger definer:** billing "escucha" el alta de tienda por trigger
    (como la membresía de owner), sin que `store` dependa de `billing` (dirección de
    dependencias del modelo: `… → billing`). Idempotente (`ON CONFLICT (store_id)`).
  - **Cambios de billing = admin:** la RLS de `subscriptions` da SELECT al equipo de la
    tienda + admins, pero UPDATE solo a admin de comunidad/plataforma (a un no-admin
    no le afecta ninguna fila → `not_found`). `plans` es referencia pública.
  - **Suscripción solo de tiendas:** los Movers no se suscriben (pagan comisión por
    envío); el sujeto polimórfico aplica a `fee_accruals`/`statements` (M7b/M7c).
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit 19/19,
  boundaries **416 módulos**). `pnpm test:integration`: db 6/6 + **core 122/122** (+4
  de M7a: lista planes, trial creado por trigger + lo ve el dueño, RLS tercero no ve,
  solo admin cambia).
- **Estado para retomar:** **M7b — comisiones devengadas** (`fee_accruals`
  polimórfico `store`|`mover`): al `completado` de un pedido devenga comisión de venta
  (% por env) a la tienda, y al `entregado` de un envío devenga comisión al Mover
  (S-3), vía triggers definer; graba `orders.fee_amount`. Luego **M7c** estados de
  cuenta (pago por comprobante, D-03) y **M7d** panel de comunidad.
- **Relacionado:** ROADMAP M7, `data-model.md` §2.5 (billing), §6 (orden de
  dependencias); entrada de M6.

## 2026-11-03 · `185bb91` · feat — M6c.2b: rastreo en vivo — Valkey + WebSockets

- **Qué:** push en vivo del rastreo (cierra M6c). Cada ping que postea el Mover se
  **publica a Valkey** (canal `shipment:<id>:ping` + índice **GEO** `shipments:geo`)
  desde `apps/api`, y un **WebSocket** `/ws/shipments/:id/track` suscribe al canal y
  reenvía los pings al navegador en vivo. El comprador ve la posición del Mover
  actualizándose sin recargar. **Enciende WebSockets + GEO (infra de M6).**
- **Por qué:** completa el "posición en vivo" de M6: la lectura deja de ser por
  recarga; el Mover se mueve y el mapa del comprador se actualiza al instante.
- **Impacto / archivos:**
  - `apps/api/package.json`: +`ioredis`, +`@hono/node-ws`, +`@3b/contracts`.
  - `apps/api/src/live.ts`: `createLive(valkeyUrl)` — publisher (`publishPing`:
    `GEOADD` + `PUBLISH`, best-effort) + factory de `subscriber` dedicado por WS.
  - `apps/api/src/index.ts`: cablea `trackingRouter({ onPing })` → `publishPing`; ruta
    **WS** `/ws/shipments/:id/track` (fuera de `/v1`: autentica por sesión + autoriza
    por visibilidad del envío bajo RLS, luego suscribe a Valkey y reenvía);
    `injectWebSocket(server)`.
  - `apps/web/_components/shipment-panel.tsx`: abre el WS mientras el envío está en
    curso y actualiza la posición en vivo (cae a la última posición del server si el
    WS falla; marca "· en vivo").
- **Decisiones de diseño:**
  - **WS fuera de `/v1`:** el middleware de `/v1` abre una transacción por request
    (no sirve para una conexión larga). El WS hace su propia auth (sesión) +
    autorización (visibilidad del envío por RLS) en `onOpen`.
  - **Subscriber dedicado por conexión:** ioredis no mezcla pub/sub en un cliente; se
    crea un subscriber por WS y se cierra en `onClose`. Publicar es **best-effort**
    (si Valkey cae, el request del ping no se cae; la DB es la fuente durable).
  - **GEO para proximidad futura:** `GEOADD shipments:geo` deja la posición indexada
    (para matching por cercanía / radio más adelante).
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit 19/19,
  boundaries **409 módulos**). `pnpm test:integration` sin cambios (2b no toca
  core/db): db 6/6 + core 118/118. **Smoke e2e:** Valkey `PONG` + `GEOPOS` OK; la API
  arranca con el publisher sin errores; el WS hace **upgrade** (open) y **cierra 1008**
  sin sesión (auth del WS verificada).
- **Estado para retomar:** **M6c completo** (rastreo en vivo con WebSockets). **M6
  salvo pendientes menores:** vencer ofertas (S-1) como job del worker, cancelar/
  fallido con motivo (S-4), auto-cierre a 48h (worker), KYC de Movers, y un mapa real
  en la web (hoy se muestran lat/lng). Siguiente hito grande: **M7 · Billing + panel
  de comunidad**.
- **Relacionado:** ROADMAP M6 (infra WebSockets/GEO), `data-model.md` §2.5; entrada de
  M6c.2a.

## 2026-11-03 · `787c3ca` · feat — M6c.2a: rastreo — pings de posición (módulo `tracking`)

- **Qué:** rastreo en vivo (parte 1). Módulo nuevo `tracking`: el **Mover asignado
  postea pings** de posición durante un viaje activo; el comprador/tienda (quien ve
  el envío) lee la **última posición** y el **recorrido**. Tabla
  `tracking.location_pings` (**particionada por mes**, D-08) con `geography(Point)`
  (PostGIS) + índice **GIST**. La publicación a Valkey + **WebSockets** (push en
  vivo) va en M6c.2b.
- **Por qué:** avanza el "posición en vivo" de M6; deja el ledger de posiciones y la
  lectura/escritura con su RLS, listo para el push en vivo.
- **Impacto / archivos:**
  - `packages/contracts/src/tracking.ts` (+exports): `LocationPing`, `PostPingInput`,
    `ShipmentTrack`.
  - `packages/db/src/schema/tracking.ts` (+`index.ts`, +`reset.ts`): `location_pings`
    (tipo custom `geography(Point,4326)`). Migración `0033_thankful_shiva.sql`: DDL
    **particionada a mano** (RANGE por `recorded_at`: meses 2026-11/12, 2027-01 +
    DEFAULT), índice **GIST** sobre `point`, RLS/grants (append-only; SELECT = quien
    ve el envío; INSERT = el Mover asignado).
  - `packages/core/src/modules/tracking/`: `infra/ping-repo.ts` (`postPing` —SQL crudo
    `ST_MakePoint`—, `latestPing`, `recentTrack` —`ST_X`/`ST_Y`—), `http/routes.ts`
    (`POST /shipments/{id}/pings`, `GET /shipments/{id}/track`; hook `onPing` opcional
    para el publisher de M6c.2b). `apps/api` monta `trackingRouter()`; `@3b/core`
    exporta `./modules/tracking`.
  - `apps/web`: `lib/shipping.ts` (`getShipmentTrack`), `_components/mover-trip.tsx`
    (botón "Compartir ubicación" con `navigator.geolocation`),
    `_components/shipment-panel.tsx` (muestra la última posición al comprador).
- **Decisiones de diseño:**
  - **`geography` + particionado a mano:** Drizzle no modela ninguno; se usa un tipo
    custom para el `point` y la DDL particionada/GIST va a mano (como `messages`). La
    app inserta/lee el punto por **SQL crudo** (`ST_MakePoint`/`ST_X`/`ST_Y`).
  - **RLS derivada del envío:** el ping se ve si el envío padre es visible; lo escribe
    solo el **Mover asignado** (`mover_id = me`). Append-only (SELECT/INSERT).
  - **`onPing` inyectable:** el router expone un hook para publicar a Valkey sin
    acoplar tracking→Valkey; lo cablea `apps/api` en M6c.2b (best-effort, no tumba el
    request).
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit 19/19,
  boundaries **407 módulos**). `pnpm test:integration`: db 6/6 + **core 118/118** (+2
  de M6c.2a: el Mover postea y el comprador ve (round-trip de lat/lng por PostGIS);
  RLS: no-Mover no postea / tercero no ve el rastreo).
- **Estado para retomar:** **M6c.2b — push en vivo**: publicar cada ping a **Valkey**
  (pub/sub por envío + GEOADD) desde `apps/api` (cliente Valkey + `onPing`) y un
  endpoint **WebSocket** que transmita los pings al comprador en vivo. Luego: vencer
  ofertas (S-1, worker), cancelar/fallido (S-4), auto-cierre 48h, KYC de Movers.
- **Relacionado:** ROADMAP M6 (infra WebSockets/GEO), `data-model.md` §2.5
  (location_pings), D-08; entrada de M6c.1.

## 2026-11-03 · `1b4f84f` · feat — M6c.1: envíos — entrega con PIN + consume de stock (`shipping`)

- **Qué:** tercera rebanada de **M6** (cierra la _salida_ de M6: "entregado con PIN").
  El **Mover asignado avanza el viaje** (`asignado → hacia_retiro → retirado →
  en_transito`) y **entrega validando el PIN** del receptor (S-3): si coincide con el
  hash (`crypt`), el envío pasa a `entregado`, lo que **consume el stock reservado**
  (venta real: `reserved`→0 y `on_hand`−qty) y mueve el pedido `en_envio→entregado`.
  El comprador **confirma** → `completado` (habilita reseñas). Cierra el lazo de
  inventario (`consume`) que arrastraba desde M5b.
- **Por qué:** cumple la _salida_ de M6 y descuenta el stock real al entregar
  (O-3/I-1), lo último que faltaba del flujo de pedido end-to-end.
- **Impacto / archivos:**
  - `packages/contracts/src/shipping.ts` (+exports): `ProgressShipmentInput`,
    `DeliverShipmentInput`. `orders.ts`: la arista `entregado → completado` pasa a
    `by: 'maker'` (el comprador confirma; el auto-cierre a 48h queda para el worker).
  - `packages/db/src/schema/shipping.ts` (+`delivered_at`). Migración
    `0032_certain_major_mapleleaf.sql`: columna + **policy `shipments_update`
    ampliada** (suma el Mover asignado) + **trigger `tg_shipment_delivered`**
    (SECURITY DEFINER: al `entregado`, consume reservas → `consumed` + movimiento
    `sale` que descuenta `on_hand`, y mueve el pedido `en_envio→entregado` con su
    evento; es acción de sistema que cruza shipping→inventory→orders).
  - `packages/core/src/modules/shipping/`: `infra/shipping-repo.ts`
    (`progressShipment`, `deliverShipment` —valida PIN con `crypt`—), rutas
    `POST /shipments/{id}/progress` y `/deliver`.
  - `apps/web`: `_components/mover-trip.tsx` (avanzar viaje + entregar con PIN),
    cableado en `/mover` ("Mis viajes"). El comprador confirma con el botón
    "Confirmar recepción" del pedido (ya existente, M5d).
- **Decisiones de diseño:**
  - **El consume + la transición del pedido van en un trigger definer:** la entrega
    la dispara el **Mover** (puede actualizar su envío por RLS), pero consumir stock y
    mover el pedido son acciones de **sistema** que el Mover no puede hacer bajo RLS →
    SECURITY DEFINER (mismo patrón que la proyección de reservas/movimientos y el
    `ofertado`). Idempotente por el único `idempotency_key` del movimiento + el guard
    de estado.
  - **PIN validado con `crypt` (S-3):** `pin_hash = crypt(pin, pin_hash)`; nunca se
    guarda el claro. El Mover ingresa el PIN que le da el receptor.
  - **`entregado → completado` por el comprador:** reemplaza la arista `system` (48h)
    para cerrar el pedido sin esperar al worker; el auto-cierre a 48h puede sumarse
    como job del worker (la transición no gatea actor en el repo).
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit 19/19,
  boundaries **401 módulos**). `pnpm test:integration`: db 6/6 + **core 116/116** (+3
  de M6c.1: entregar con PIN → consume stock (`reserved`→0, `on_hand`−2) + pedido
  `entregado→completado`; PIN incorrecto; solo el Mover asignado avanza).
- **Estado para retomar:** **M6c.2 — rastreo en vivo**: `tracking.location_pings`
  (particionada por mes + `geography(Point)`), el Mover postea pings durante el viaje,
  el comprador/tienda ve la posición; **GEO en Valkey** (pub/sub por envío) +
  **WebSockets** en `@3b/api`. Luego: vencer ofertas (S-1, worker), cancelar/fallido
  con motivo (S-4), auto-cierre a 48h, KYC de Movers.
- **Relacionado:** ROADMAP M6, `data-model.md` §5 (S-3, I-1, O-3), §6; entradas de
  M6a/M6b y M5b (reservas/consume diferido).

## 2026-11-03 · `675cd9d` · feat — M6b: envíos — asignación + PIN (`shipping`)

- **Qué:** segunda rebanada de **M6**. El solicitante **acepta una oferta**: el envío
  queda `asignado` con el Mover y el precio pactado, se **genera un PIN** y se guarda
  su **hash** (S-2, `crypt`/`gen_salt` de pgcrypto), se **rechazan** las demás ofertas
  activas, y el pedido pasa **`listo → en_envio`** (shipping dispara la transición de
  `orders`, como payments). El PIN se devuelve en claro **una sola vez**. El Mover ve
  sus **viajes asignados**.
- **Por qué:** avanza la _salida_ de M6 ("… → asignado → …"); engancha envío ↔ pedido
  (un Mover asignado mueve el pedido a `en_envio`).
- **Impacto / archivos:**
  - `packages/contracts/src/shipping.ts` (+export): `ShipmentAssignment`
    (`{ shipment, pin }`).
  - `packages/db/src/schema/shipping.ts` (+migración `0031_demonic_polaris.sql`):
    índice `shipments_order_idx` (ancla la migración) + **UPDATE grants + policies**
    sobre `shipments` y `shipment_offers` (asignar/aceptar: solicitante o miembro de
    la tienda).
  - `packages/core/src/modules/shipping/`: `infra/shipping-repo.ts` (`acceptOffer`
    —asigna + PIN hash + rechaza otras + transición de `orders`—, `listMoverShipments`),
    rutas `POST /shipments/{id}/offers/{offerId}/accept` y `GET /shipments/assigned`.
  - `apps/web`: `_components/shipment-panel.tsx` (aceptar oferta + mostrar PIN una vez
    + Mover asignado; solo con el pedido `listo`), `lib/shipping.ts`
    (`getAssignedShipments`), `/mover` (sección "Mis viajes").
- **Decisiones de diseño:**
  - **PIN hasheado (S-2), visible una vez:** se guarda `crypt(pin, gen_salt('bf'))`
    para validar en la entrega (M6c); el claro se devuelve solo en la respuesta de
    aceptar (quien acepta lo comparte con el receptor). La entrega del PIN al
    comprador por notificación queda para cuando exista ese canal.
  - **Asignar exige el pedido `listo`:** `en_envio` = "Mover asignado" (§6); si el
    pedido no está `listo`, se rechaza con `order_not_ready`. La transición la dispara
    `shipping` vía `transitionOrder` (arista `system` del grafo; el repo no gatea
    actor, la RLS sí: el solicitante es miembro de la tienda).
  - **Rechazo de las demás ofertas en la app, bajo RLS:** `app` suma UPDATE sobre
    shipments/offers con policy (solicitante/tienda); se acepta una y se marcan
    `rejected` las que seguían `active`.
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit 19/19,
  boundaries **399 módulos**). `pnpm test:integration`: db 6/6 + **core 113/113** (+2
  de M6b: aceptar → `asignado`+PIN+pedido `en_envio`+rechazo de otras; no asignar si el
  pedido no está `listo`). El test agrega un 2º Mover (Marta) vía owner para el
  rechazo.
- **Estado para retomar:** **M6c — rastreo + entrega con PIN**: progreso del viaje
  (`hacia_retiro`/`retirado`/`en_transito` por el Mover), `tracking.location_pings`
  (particionada + GEO en Valkey + WebSockets), y **entrega con PIN** (S-3) → envío
  `entregado` + pedido `entregado → completado` **y el `consume` real de `on_hand`**.
  También: vencer ofertas (S-1, worker), cancelar/fallido con motivo (S-4), KYC de
  Movers.
- **Relacionado:** ROADMAP M6, `data-model.md` §5 (S-2/S-3), §6 (máquina de envío);
  entrada de M6a.

## 2026-11-02 · `a9c2687` · feat — M6a: envíos — solicitud + ofertas de Movers (módulo `shipping`)

- **Qué:** arranca **M6 · Envíos**. Módulo nuevo `shipping`: el Seller **solicita un
  envío** para un pedido `delivery` (nace `solicitado`); los **Movers aprobados que
  operan en la comunidad ofertan** (precio + ETA), lo que mueve el envío a `ofertado`
  (trigger). Se enriquece `mover_profiles` con `operating_communities`. La asignación
  + PIN (M6b) y el rastreo + entrega (M6c) siguen.
- **Por qué:** primera rebanada de la _salida_ de M6 ("solicitado → ofertado → …");
  deja el carril de oferta de Movers con su RLS por comunidad.
- **Impacto / archivos:**
  - `packages/contracts/src/shipping.ts` (+exports): `ShipmentStatus`, `OfferStatus`,
    `Shipment`, `ShipmentOffer`, `CreateShipmentInput`, `CreateOfferInput`.
  - `packages/db/src/schema/identity.ts`: `mover_profiles.operating_communities`
    (`uuid[]`). `packages/db/src/schema/shipping.ts` (+`index.ts`, +`reset.ts`):
    `shipments` y `shipment_offers`. Migración `0030_wooden_marten_broadcloak.sql`:
    ALTER mover_profiles + tablas + CHECKs + índice parcial de ofertas + RLS/grants +
    **trigger `tg_shipment_offered`** (SECURITY DEFINER: la 1ª oferta mueve el envío a
    `ofertado`, así `app` no necesita UPDATE sobre shipments). Seed: Pedro opera en
    Coro + Punto Fijo.
  - `packages/core/src/modules/shipping/`: `infra/shipping-repo.ts` (`createShipment`,
    `getShipment`/`getShipmentByOrder`, `listOpenShipments`, `makeOffer`,
    `listShipmentOffers`), `http/routes.ts`, `index.ts`. `apps/api` monta
    `shippingRouter()`; `@3b/core` exporta `./modules/shipping`.
  - `apps/web`: `lib/shipping.ts`, `_components/shipment-panel.tsx` (solicitar /
    ver ofertas en la ficha de pedido) + `_components/mover-queue.tsx` (cola + ofertar)
    reemplazando el placeholder de `/mover`.
- **Decisiones de diseño:**
  - **`ofertado` lo hace un trigger definer, no el Mover:** `app` tiene SELECT/INSERT
    sobre shipments (no UPDATE); al insertar la 1ª oferta, el trigger (owner) bumpea
    el estado. Movers no tocan el estado del envío a mano.
  - **Elegibilidad por `operating_communities`:** la RLS de ofertas exige Mover
    **aprobado** cuyo `operating_communities` contenga la comunidad del envío. El
    envío lo ven el solicitante, el Mover asignado, la **tienda**, el **comprador**
    (su pedido) y los Movers que operan ahí.
  - **Geo diferido a M6c:** sin `geography(Point)` todavía; origen/destino son texto
    (tienda / dirección del pedido). `pin_hash`/`proof_media_id` quedan previstos.
  - **`shipping → orders`** por el `index.ts` público, sin ciclo.
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit 19/19,
  boundaries **398 módulos**). `pnpm test:integration`: db 6/6 + **core 111/111** (+5
  de M6a: solicitar + ofertar → `ofertado`, no-delivery, no dos envíos activos, no
  doble oferta, RLS: no-Mover no oferta / tercero no ve / comprador sí). Smoke: la API
  publica las 5 rutas de `shipping`.
- **Estado para retomar:** **M6b — asignación + PIN**: el solicitante acepta una
  oferta → `asignado`, se genera `pin_hash` (S-2), se rechazan las demás ofertas, y el
  pedido pasa `listo → en_envio` (shipping dispara la transición de `orders`, como
  payments). Luego **M6c** — rastreo (`location_pings` particionada + GEO en Valkey +
  WebSockets) + entrega con PIN (S-3) → pedido `entregado`→`completado` **y el
  `consume` real de stock**. También: vencer ofertas (S-1) como job del worker, y el
  KYC de Movers.
- **Relacionado:** ROADMAP M6, `data-model.md` §2.5 (shipping/tracking), §5 (S-1…S-4),
  §6 (máquina de envío), D-01; entrada de M5.

## 2026-11-02 · `7ad0aad` · feat — M5-infra.2: worker (runtime) + Valkey (pub/sub)

- **Qué:** enciende **`apps/worker`** (dejaba de ser placeholder) y **Valkey**. El
  worker corre dos jobs de sistema con la conexión **owner**: (1) **vencimiento de
  reservas** (llama a `sweepExpiredReservations` cada `WORKER_SWEEP_INTERVAL_MS`) y
  (2) **publisher del outbox** (`drainOutbox` cada `WORKER_OUTBOX_INTERVAL_MS`: lee
  `platform.outbox` pendiente y publica cada evento en **Valkey** pub/sub, marcándolo
  publicado). Con esto **M5 queda 100% cerrado** (features + infra).
- **Por qué:** cierra la infra que arrastraban M5/M3: I-5 (vencer reservas de verdad)
  y la emisión de `stock.changed` a un broker para consumidores en vivo.
- **Impacto / archivos:**
  - `docker-compose.yml`: servicio `valkey` (`valkey/valkey:8-alpine`, broker sin
    persistencia, host **6380**). `pnpm db:up` ahora levanta Postgres + Valkey.
  - `packages/config/src/env.ts`: `VALKEY_URL` (default `redis://localhost:6380`) +
    `WORKER_SWEEP_INTERVAL_MS` (30 s) / `WORKER_OUTBOX_INTERVAL_MS` (2 s).
  - `packages/core/src/modules/platform/`: `infra/outbox.ts` con
    `drainOutbox(db, publish, limit)` (at-least-once; `publish` inyectable para
    testear sin broker) + `index.ts`; `@3b/core` exporta `./modules/platform`.
  - `apps/worker`: `package.json` (deps `@3b/core`/`@3b/db`/`@3b/config` + `ioredis`;
    scripts `dev`/`start`), `src/index.ts` (loops sin solape + apagado ordenado
    SIGINT/SIGTERM). `CLAUDE.md` actualizado (worker ya corre; Valkey en db:up).
  - Test `outbox-drain.test.ts`: drena con un `publish` capturador; verifica
    publicado + marcado + idempotencia.
- **Decisiones de diseño:**
  - **Lógica en core, runtime fino en el worker:** `drainOutbox`/`sweep…` viven en
    `@3b/core` (testeables con DB, sin Valkey); `apps/worker` solo orquesta loops +
    el cliente Valkey (inyecta `publish`).
  - **Valkey como broker, outbox como fuente durable:** el broker no persiste (la
    verdad está en `platform.outbox`); si Valkey se cae, el outbox retiene los
    eventos y el publisher reintenta (at-least-once; consumidores idempotentes).
  - **Puerto 6380** (como el 5433 de Postgres): deja libre el 6379 por si hay un Redis
    nativo en la máquina.
- **Verificación:** `pnpm check` **verde** (lint, typecheck **10/10** con el worker,
  unit 19/19, boundaries **389 módulos**). `pnpm test:integration`: db 6/6 + **core
  106/106** (+3 de drenado). **Smoke e2e:** `docker compose up -d valkey` (PONG) →
  insertar un `stock.changed` en el outbox → `@3b/worker start` lo drena en el primer
  tick (`eventos publicados: 1`) y lo deja `published_at` seteado.
- **Estado para retomar:** **M5 cerrado (features + infra).** Mejora futura del
  worker (no bloquea M5): **particionado mensual + retención 90 d de `messages`**
  (D-08) como job programado; y cuando una transacción de negocio bajo `app` necesite
  emitir eventos, sumar grant/policy de INSERT a `platform.outbox`. Siguiente hito:
  **M6 · Envíos** (shipping/tracking, WebSockets + GEO; ahí el `consume` real de
  stock del flujo de entrega).
- **Relacionado:** ROADMAP M5 (infra) y M6, `data-model.md` §5 (I-5), §2.5 (outbox);
  entrada de M5-infra.1.

## 2026-11-02 · `01e0378` · feat — M5-infra.1: outbox + vencimiento de reservas (I-5)

- **Qué:** primera rebanada de la **infra de M5** (la que cierra lo último que
  quedaba). Nueva tabla `platform.outbox` (patrón outbox) y un **job de sistema**
  `sweepExpiredReservations`: libera las reservas `active` con `expires_at` vencido
  (I-5) —el trigger devuelve `reserved`— y escribe un evento `stock.changed` por
  variante en el outbox (lo publicará el worker). El **runtime del worker + Valkey**
  es la rebanada siguiente (infra.2); acá está la **lógica**, testeada.
- **Por qué:** `expires_at` se grababa desde M5b pero nadie lo barría; I-5 ("reservas
  con vencimiento") quedaba a medias. Esto lo cierra y deja el `stock.changed` en el
  outbox listo para publicar.
- **Impacto / archivos:**
  - `packages/db/src/schema/platform.ts` (+migración `0029_dear_thor_girl.sql`):
    tabla `outbox` (topic/payload/published_at, solo inserción) + índice parcial
    `WHERE published_at IS NULL` (pendientes). **Sin grants a `app`**: la escribe el
    worker (owner) y, más adelante, las transacciones de negocio. `@3b/db` exporta
    `lt`.
  - `packages/core/src/modules/inventory/infra/reservations.ts` (+export):
    `sweepExpiredReservations(db: AppDatabase)` — corre con la conexión **owner**
    (sin contexto de usuario, bypassa RLS por ser job de sistema), en su propia
    transacción; libera lo vencido y emite el evento.
  - Test `reservation-sweep.test.ts`: conexión `app` para el setup (variante
    dedicada) + conexión `owner` para el sweep.
- **Decisiones de diseño:**
  - **El sweep es un job de sistema → conexión owner:** no hay usuario, así que la
    RLS de `reservations` (maker/miembro) bloquearía un barrido global. El worker usa
    el owner (como las migraciones); el predicado es puramente de sistema
    (`expires_at < now()`), no entra input de usuario.
  - **`stock.changed` al outbox, no directo a Valkey:** el evento se persiste en la
    misma transacción que la liberación (entrega garantizada); un publisher aparte
    (infra.2) lo drena a Valkey. Las reservas con `expires_at` nulo no vencen.
  - **Outbox owner-only por ahora:** el único productor en esta rebanada es el sweep
    (owner). Cuando una transacción de negocio bajo `app` necesite emitir eventos,
    esa migración sumará el grant + policy.
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit 19/19,
  boundaries **385 módulos**). `pnpm test:integration`: db 6/6 + **core 103/103** (+2:
  barre lo vencido + emite evento; no toca lo futuro). El sweep es global pero solo
  vencen las reservas de este test (las de otros archivos nacen con +30 min).
- **Estado para retomar:** falta **infra.2 — worker (runtime) + Valkey**: encender
  `apps/worker` (loop que llama al sweep en intervalo + publisher que drena el outbox
  a Valkey pub/sub), Valkey en `docker-compose`, `VALKEY_URL` en config. Luego, el
  **particionado mensual + retención de `messages`** (D-08) puede ser otro job del
  worker. Con infra.2, **M5 queda 100% cerrado**.
- **Relacionado:** ROADMAP M5 (infra), `data-model.md` §5 (I-5), §2.5 (outbox),
  D-08; entradas de M5b (reservas) y M3 r1 (stock).

## 2026-11-02 · `fd20b8d` · feat — M5c.2: captura del pago (visibilidad media→pedido)

- **Qué:** cierra el pendiente de **M5c**: la **captura** del comprobante. El
  comprador adjunta una imagen al reportar el pago (`proof_media_id`, ya previsto) y
  ahora la **tienda la ve** gracias a una policy de visibilidad cruzada
  `media_select_payment_proof`. Web: el panel de pago sube la captura (media propia
  `ownerType:'user'`, dos fases) y muestra la imagen a ambas partes.
- **Por qué:** era el último feature diferido de M5 (junto con social): sin esto el
  Seller no podía ver el comprobante que sube el comprador.
- **Impacto / archivos:**
  - `packages/db/src/schema/payments.ts`: índice `payment_reports_proof_idx`
    (lookup inverso de la policy). Migración `0028_smiling_lester.sql`: el índice +
    **policy permissive** `media_select_payment_proof` (la media referenciada por un
    `payment_reports.proof_media_id` es visible a los participantes del pedido —Maker
    o miembro de la tienda—; mismo patrón que `media_select_item` de M4 o la de KYC).
  - `apps/web`: `lib/orders.ts` (`getMediaUrl`); `comprar/pedidos/[id]` resuelve las
    URLs de las capturas y las pasa al panel; `_components/payment-panel.tsx` (subida
    de la captura en el reporte + visualización de la imagen del comprobante).
- **Decisiones de diseño:**
  - **Visibilidad por referencia, no por dueño:** la captura la sube el comprador
    como media propia (`ownerType:'user'`, que ya autoriza `authorizeOwner`); la
    policy la abre a la contraparte **vía el enlace del comprobante** (RLS pura; `GET
    /media/{id}` ya se apoya en RLS, como con KYC). Sin acoplar media→payments en el
    código ni tocar `authorizeOwner`.
  - **Índice como vehículo de la migración:** la policy es solo-SQL (sin cambio de
    esquema que genere migración); se la ancla a un índice útil en `proof_media_id`
    (que además acelera el `EXISTS` de la policy), evitando editar journal/snapshot a
    mano.
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit 19/19,
  boundaries **384 módulos**). `pnpm test:integration`: db 6/6 + **core 101/101** (+2
  de M5c.2: la captura la ve la tienda y no un tercero; control de que una media no
  adjunta no se ve). El test adjunta el comprobante con un insert directo de
  `payment_reports` (sin aceptar el pedido → sin reserva, sin contención).
- **Estado para retomar:** **M5 cerrado a nivel features** (carrito → pago con
  captura → estados → chat + reseñas + preguntas + reportes). Único pendiente de M5:
  **infra worker + Valkey** (vencer reservas I-5, `stock.changed`, particiones
  mensuales + retención de `messages`), que es su propia rebanada. Después: **M6 ·
  Envíos** (y ahí el `consume` real de stock del flujo de entrega).
- **Relacionado:** ROADMAP M5, `data-model.md` §3 (payments/media), D-03/D-10;
  entradas de M5c y M4 r2 (patrón de visibilidad de media).

## 2026-11-02 · `3d585d4` · feat — M5d.4: reportes de moderación (`social.reports`)

- **Qué:** cuarta rebanada de **M5d**. Moderación de contenido: cualquiera que ve la
  comunidad **reporta** un contenido (`item`/`review`/`question`/`store`) con un
  motivo; el **admin de la comunidad** (o de plataforma) ve la cola y lo
  **resuelve/descarta**. Tabla `social.reports` (target polimórfico sin FK dura;
  `community_id` **derivado del target**, nunca del cliente). API: `POST /v1/reports`,
  `GET /v1/reports?status=`, `POST /v1/reports/{id}/resolve`. Web: botón "Reportar"
  en la ficha de ítem + cola de moderación en `/admin` (antes placeholder).
- **Por qué:** completa la superficie **social** de M5 (reseñas + preguntas +
  reportes) del mapa de datos (§2.5).
- **Impacto / archivos:**
  - `packages/contracts/src/social.ts` (+exports): `ReportTargetType`,
    `ReportStatus`, `Report`, `ReportList`, `CreateReportInput`, `ResolveReportInput`.
  - `packages/db/src/schema/social.ts` (+migración `0027_tough_chat.sql`): tabla
    `reports` + CHECKs (target/status/motivo) + RLS/grants (INSERT = reporter que ve
    la comunidad; SELECT/UPDATE = admin de la comunidad/plataforma, y el reporter ve
    el suyo).
  - `packages/core/src/modules/social/`: `infra/report-repo.ts` (`createReport`
    —resuelve `community_id` del target—, `listReports`, `resolveReport`), rutas en
    `http/routes.ts`, +exports. (`socialRouter` ya montado.)
  - `apps/web`: `lib/social.ts` (`getReports`), `_components/report-button.tsx` +
    `_components/reports-queue.tsx`, cableado en `comprar/[id]` y en `/admin` (cola).
- **Decisiones de diseño:**
  - **`community_id` derivado del target (no del cliente):** `createReport` mira la
    tabla del `target_type` (item/review/question/store) bajo RLS para fijar el
    alcance; así la cola queda acotada al admin correcto. Sin FK dura (target
    polimórfico, D-04-style).
  - **RLS como candado de moderación:** resolver = admin de la comunidad o de
    plataforma (a un no-admin no le afecta ninguna fila → 404 limpio). El reporter ve
    el suyo. Append-only salvo la resolución (UPDATE del admin).
  - **Triage en `/admin` (platform):** la cola de comunidad para community-admins
    tendrá su propia superficie web más adelante; por ahora el loop se demuestra con
    el admin de plataforma (RLS ya habilita a ambos).
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit 19/19,
  boundaries **383 módulos**). `pnpm test:integration`: db 6/6 + **core 99/99** (+4 de
  M5d.4: reportar deriva comunidad, target inexistente, RLS reporter-ve/tercero-no,
  solo admin resuelve).
- **Relacionado:** ROADMAP M5 (M5d), `data-model.md` §2.5 (reports); entradas de
  M5d.1–M5d.3.

## 2026-11-02 · `19ba62a` · feat — M5d.3: preguntas públicas de ítem (`social.questions`)

- **Qué:** tercera rebanada de **M5d**. Preguntas públicas sobre un ítem publicado:
  cualquiera que ve el ítem **pregunta**; la **tienda responde**. Tabla
  `social.questions` (con `store_id`/`community_id` denormalizados del ítem y
  `author_name` congelado). API: `GET /v1/items/{id}/questions`,
  `POST /v1/items/{id}/questions`, `POST /v1/questions/{id}/answer`. Web: bloque de
  Preguntas en la ficha pública del ítem (preguntar; responder si sos de la tienda).
- **Por qué:** es el feature que faltaba del listado de M5d en el roadmap; completa
  la superficie **social** de M5 (reseñas + preguntas).
- **Impacto / archivos:**
  - `packages/contracts/src/social.ts` (+exports): `Question`, `QuestionList`,
    `AskQuestionInput`, `AnswerQuestionInput`.
  - `packages/db/src/schema/social.ts` (+migración `0026_productive_diamondback.sql`):
    tabla `questions` + CHECK (body 3–1000) + RLS/grants (SELECT por comunidad o
    autor; INSERT = quien ve la comunidad, como sí mismo; **UPDATE/answer = miembro
    de la tienda**).
  - `packages/core/src/modules/social/`: `infra/question-repo.ts` (`askQuestion`
    —resuelve ítem publicado/visible y denormaliza store/community—,
    `listItemQuestions`, `findQuestion`, `answerQuestion`), rutas en `http/routes.ts`,
    +exports en `index.ts`. (`socialRouter` ya montado en `apps/api`.)
  - `apps/web`: `lib/social.ts` (`getItemQuestions`),
    `_components/item-questions.tsx` (preguntar + responder), cableado en
    `comprar/[id]`.
- **Decisiones de diseño:**
  - **Pregunta pública, respuesta de la tienda:** SELECT por comunidad (como el
    descubrimiento); la **respuesta** (UPDATE) la gatea `is_store_member` (http) con
    la RLS como candado. `author_name` congelado (evita joins cruzados). El ítem debe
    estar **publicado** para preguntar (lo valida el servicio bajo RLS).
  - **Sin contención de stock:** las preguntas no tocan pedidos/stock, así que el test
    usa el TALADRO del seed directamente (a diferencia de reseñas).
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit 19/19,
  boundaries **379 módulos**). `pnpm test:integration`: db 6/6 + **core 95/95** (+4 de
  M5d.3: preguntar + ver, responder, no-miembro no responde (RLS), no-publicado no
  admite preguntas).
- **Relacionado:** ROADMAP M5 (M5d), `data-model.md` §2.5 (questions); entradas de
  M5d.1/M5d.2.

## 2026-11-02 · `b0cefcb` · feat — M5d.2: reseñas verificadas al completado (módulo `social`)

- **Qué:** segunda rebanada de **M5d** (cierra la _salida_ de M5d). Módulo nuevo
  `social`: al `completado` el comprador (Maker) deja **una** reseña de la **tienda**
  (rating 1–5 + comentario), con `author_name`/`community_id` congelados; se publica
  en el storefront (promedio + conteo + recientes). Para **alcanzar `completado`** sin
  M6 se habilita el cierre por **retiro en tienda**: nueva arista
  `retirado → completado` (el comprador confirma) y el endpoint genérico suma
  `retirado` (Seller) y `completado` (Maker) al allowlist.
- **Por qué:** cumple la _salida_ de M5d ("pedido `completado` con reseña"); engancha
  reseña ↔ pedido (O-3: al completar se habilitan reseñas) con el candado D-04 (una
  por pedido y destinatario).
- **Impacto / archivos:**
  - `packages/contracts/src/social.ts` (+exports): `ReviewSubjectType`, `Review`,
    `ReviewList`, `StoreReviewSummary`, `CreateReviewInput`.
  - `packages/contracts/src/orders.ts`: nueva arista `retirado → completado` (maker)
    en `ORDER_TRANSITIONS`.
  - `packages/db/src/schema/social.ts` (+`index.ts`, +`reset.ts`): tabla `reviews`
    (único `(order, author, subject_type)` D-04). Migración
    `0025_blue_bill_hollister.sql`: tabla + CHECKs (rating 1–5, subject) + RLS/grants
    (append-only; SELECT por comunidad o autor; INSERT = comprador de un pedido
    `completado` de esa comunidad/tienda).
  - `packages/core/src/modules/orders/http/routes.ts`: `GENERIC_TARGETS` suma
    `retirado`/`completado`.
  - `packages/core/src/modules/social/`: `infra/review-repo.ts`
    (`createStoreReview`, `listOrderReviews`, `storeReviewSummary`; congela
    `author_name`), `http/routes.ts` (`POST /orders/{id}/reviews`,
    `GET /orders/{id}/reviews`, `GET /stores/{id}/reviews`), `index.ts`. `apps/api`
    monta `socialRouter()`; `@3b/core` exporta `./modules/social`.
  - `apps/web`: `lib/social.ts` (`getOrderReviews`/`getStoreReviews`/`stars`),
    `_components/review-form.tsx` (estrellas + comentario / reseña en lectura),
    cableado en `comprar/pedidos/[id]` (reseñar al completar) y en el storefront
    `comprar/tienda/[id]` (promedio + lista). `lib/orders.ts` suma los botones
    "Marcar retirado" (Seller) y "Confirmar recepción" (Maker).
- **Decisiones de diseño:**
  - **Reseña verificada = nace de un pedido `completado`:** el servicio chequea
    dueño + estado + no-duplicado; la **RLS** es el candado final (INSERT exige ser el
    Maker de un pedido completado de esa comunidad/tienda). Append-only (SELECT/INSERT;
    no se edita ni borra).
  - **Cierre por retiro sin M6:** `retirado → completado` (maker) da un camino a
    `completado` para pickup sin el flujo de Movers (M6). El **`consume`** de stock
    sigue diferido: al `retirado` la reserva se mantiene (no-op) hasta M6.
  - **Snapshot `author_name`/`community_id`:** evita joins cruzados bajo RLS (el nombre
    del autor) y habilita la visibilidad por comunidad (como el descubrimiento).
    `subject_type` polimórfico (D-04); M5d.2 cablea `store`.
  - **`social → orders`** por el `index.ts` público, sin ciclo.
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit 19/19,
  boundaries **376 módulos** sin violaciones). `pnpm test:integration`: db 6/6 +
  **core 91/91** (+5 de M5d.2: solo al completado, reseña ok + resumen, no-duplicado
  D-04, solo el comprador, RLS insert ajeno rechazado). El test de `social` crea una
  **variante dedicada** (`beforeAll`) porque al completar retiene la reserva (consume
  diferido), evitando carreras con orders/inventory. Smoke: la API publica las rutas
  de `social` en `/openapi.json`.
- **Estado para retomar:** **M5d.2 cerrado → M5d completo** (pedido `completado` con
  reseña y un hilo de chat). Pendientes de `social`: **preguntas públicas**
  (`questions`) + `reports`, y reseñas a **Mover/Maker** (D-04) con M6. Pendientes que
  arrastra M5: **worker + Valkey** (vencer reservas, `stock.changed`, particiones
  mensuales + retención de `messages`), el **`consume`** (venta real de `on_hand`) del
  flujo de entrega (M6) y la **captura** del pago.
- **Relacionado:** ROADMAP M5 (M5d), `data-model.md` §2.5 (social), §5 (O-3), §6,
  D-04; entradas de M5a–M5d.1.

## 2026-11-02 · `b3f749c` · feat — M5d.1: chat contextual del pedido (módulo `messaging`)

- **Qué:** primera rebanada de **M5d**. Módulo nuevo `messaging`: hilo de chat
  **por pedido** entre el comprador (Maker) y la tienda (Seller). `conversations`
  (una por `(context, context_id)`; contexto `order` cableado) + `messages`
  (**particionada por mes**, D-08). Endpoints: abrir el hilo (`GET
  /v1/orders/{id}/conversation`, crea la conversación de forma perezosa), enviar
  (`POST /v1/orders/{id}/messages`) y marcar leído (`POST
  /v1/orders/{id}/conversation/read`). Web: panel de chat en la ficha del pedido
  (mis mensajes a la derecha, recibo "Visto").
- **Por qué:** avanza la _salida_ de M5d ("… y un hilo de chat"); deja el carril de
  conversación contextual listo para colgar otros contextos (ítem/envío/tienda) y
  para `social` (M5d.2).
- **Impacto / archivos:**
  - `packages/contracts/src/messaging.ts` (+exports): `ConversationContext`,
    `Conversation`, `Message`, `MessageThread`, `SendMessageInput`.
  - `packages/db/src/schema/messaging.ts` (+`index.ts`, +`reset.ts`):
    `conversations` (único `(context, context_id)`) y `messages` (PK compuesta
    `(id, created_at)` por el particionado). Migración
    `0024_complete_sleepwalker.sql`: DDL **particionada a mano** (RANGE por
    `created_at`: meses 2026-11/12 y 2027-01 + partición DEFAULT), CHECKs,
    RLS/grants. `@3b/db` exporta `ne`.
  - `packages/core/src/modules/messaging/`: `infra/conversation-repo.ts`
    (`getOrderThread`, `sendOrderMessage`, `markOrderThreadRead`; conversación
    perezosa idempotente), `http/routes.ts`, `index.ts`. `apps/api` monta
    `messagingRouter()`; `@3b/core` exporta `./modules/messaging`.
  - `apps/web`: `lib/messaging.ts` (`getOrderThread`),
    `_components/order-chat.tsx` (hilo + envío + marcar leído al abrir), cableado en
    `comprar/pedidos/[id]`.
- **Decisiones de diseño:**
  - **Autorización derivada del pedido (sin materializar `participants`):** la RLS
    de `conversations` deriva de `orders` (en `order`: Maker dueño o miembro de la
    tienda); `messages` deriva de la conversación padre. Se difiere la columna
    `participants` (hará falta para contextos que no cuelgan de una sola entidad).
  - **`messages` particionada por mes (D-08):** Drizzle no modela particiones
    declarativas, así que la DDL va a mano en la migración (el objeto Drizzle apunta
    al padre, solo para el query builder) y la PK incluye `created_at`. Partición
    DEFAULT como red de seguridad; la creación de meses nuevos + retención 90 d
    quedan para el **worker**.
  - **Conversación perezosa:** se crea al abrir/escribir el hilo (idempotente por el
    índice único), así la web siempre tiene un hilo que mostrar sin un paso de
    "crear chat".
  - **`messaging → orders`** por el `index.ts` público (como `payments`), sin ciclo.
- **Verificación:** `pnpm check` **verde** (lint, typecheck, unit 19/19, boundaries
  **368 módulos** sin violaciones). `pnpm test:integration`: db 6/6 + **core 86/86**
  (+4 de M5d.1: Maker escribe→tienda ve, respuesta ordenada, marcar leído solo
  entrantes, RLS tercero no ve/escribe). Smoke: la API arranca y publica las 3 rutas
  de `messaging` en `/openapi.json`.
- **Estado para retomar:** **M5d.1 (messaging) cerrado.** Siguiente: **M5d.2 —
  `social`** (reseñas verificadas al `completado` + preguntas públicas), que además
  necesita **habilitar el camino a `completado`** (hoy el genérico llega a `listo`;
  falta la arista de cierre para retiro/pickup sin M6). Pendientes que arrastra M5:
  **worker + Valkey** (vencer reservas, `stock.changed`, crear particiones mensuales
  + retención de `messages`), el `consumed` (venta) y la captura del pago.
- **Relacionado:** ROADMAP M5 (M5d), `data-model.md` §2.5 (messaging/social), §6,
  D-08; entradas de M5a–M5c.

## 2026-11-02 · `3b40743` · feat — M5c: pago por comprobante (módulo `payments`)

- **Qué:** tercera rebanada de **M5**. Módulo nuevo `payments`: el Maker **reporta
  un pago** (método + **referencia bancaria única** + monto) sobre un pedido
  `aceptado`, que pasa a `pago_reportado` y **congela `fx_rate_ves`** (P-2); el
  Seller lo **confirma** (`pago_confirmado`) o lo **rechaza** (`pago_rechazado`, que
  libera la reserva de stock). **Salida de M5c: el pedido llega a `pago_confirmado`.**
  El endpoint genérico de transición ahora también habilita `en_preparacion`, con lo
  que el Seller sigue hasta `listo`.
- **Por qué:** cumple la _salida_ de M5c del roadmap y cierra el lazo pago↔pedido
  (P-1/P-2/P-3): un comprobante mueve el pedido por la máquina de estados, sin poder
  falsear estados de pago a mano.
- **Impacto / archivos:**
  - `packages/contracts/src/payments.ts` (+exports): `PaymentStatus`,
    `PaymentReport`/`PaymentReportList`, `ReportPaymentInput`, `ReviewPaymentInput`,
    `FxRate` (reusa `PaymentMethodType` de `store`).
  - `packages/db/src/schema/payments.ts` (+`index.ts`, +`reset.ts`):
    `payment_reports` (FK pedido/media/usuarios) y `fx_rates`. Migración
    `0023_lumpy_slipstream.sql`: tablas + CHECKs + **`unique(method, reference)`**
    (P-1) + RLS/grants (`fx_rates` SELECT público de solo lectura; `payment_reports`
    SELECT Maker|tienda, INSERT solo el Maker dueño registrándose como reporter,
    UPDATE solo miembros de la tienda). `@3b/db` exporta `isNull`.
  - `packages/core/src/modules/orders/`: `freezeFxRate` (congela `fx_rate_ves` si era
    nulo; +export) y el allowlist del endpoint genérico pasa a `GENERIC_TARGETS` con
    `en_preparacion`.
  - `packages/core/src/modules/payments/`: `infra/payment-repo.ts` (`reportPayment`
    —pre-chequea P-1 → 409, congela fx, crea comprobante, `aceptado→pago_reportado`—;
    `reviewPayment` —confirma/rechaza + transición—; `listPaymentsForOrder`),
    `http/routes.ts` (`POST /orders/{id}/payments`, `GET …/payments`,
    `POST …/payments/{paymentId}/review`), `index.ts`. `apps/api` monta
    `paymentsRouter()`; `@3b/core` exporta `./modules/payments`.
  - `apps/web`: `lib/orders.ts` (`getOrderPayments`, `en_preparacion`→"Preparar"),
    `_components/payment-panel.tsx` (reportar / confirmar / rechazar + historial),
    cableado en `comprar/pedidos/[id]` (+ muestra la tasa Bs congelada).
  - `packages/db/src/seed.ts`: tasa `fx_rates` 2026-11-02 BCV 52.3600.
- **Decisiones de diseño:**
  - **`payments` dispara las transiciones del pedido, no el endpoint genérico:** así
    no se puede setear `pago_*` sin un comprobante real. `payments` llama a `orders`
    por su `index.ts` (`transitionOrder`/`getOrder`/`freezeFxRate`); `payments →
    orders → inventory`, sin ciclo.
  - **fx se congela al reportar, no al crear:** evita acoplar `orders → payments`
    (que generaría un ciclo con las transiciones). `orders.freezeFxRate` es
    idempotente (solo si `fx_rate_ves` era nulo); `payments` le pasa la tasa vigente.
    Relaja el "al crearlo" de P-2 a "al reportar" (cuando el monto en Bs importa).
  - **RLS por rol derivada del pedido:** reportar = Maker dueño; revisar = miembro de
    la tienda; ver = ambos. P-1 `unique(method, reference)` global con pre-chequeo
    (409 limpio) + índice único como candado final.
  - **Captura (`proof_media_id`) diferida:** la columna/FK quedan listas, pero la
    subida del comprobante y su **visibilidad cruzada** (policy `media → pedido` para
    que el Seller vea la captura del comprador) van en una rebanada posterior.
- **Verificación:** `pnpm check` **verde** (typecheck 10/10, unit 19/19, boundaries
  **360 módulos** sin violaciones). `pnpm test:integration`: db 6/6 + **core 82/82**
  (+6 de M5c: reportar + congelar fx, referencia duplicada P-1, estado inválido,
  confirmar → `pago_confirmado`, rechazar → libera reserva, RLS tercero no reporta/ve).
  Smoke HTTP: Carlos acepta; el Seller (no comprador) reportando **403**; Lucía
  reporta **201** (`pago_reportado`, `fxRateVes` 52.3600); Pedro revisando **404**
  (RLS); Carlos confirma **200** → `pago_confirmado`; luego `en_preparacion`/`listo`
  200.
- **Estado para retomar:** **M5c cerrado** (el pedido llega a `pago_confirmado` y el
  Seller sigue hasta `listo`). Siguiente: **M5d — conversación + social**
  (`messaging` chat contextual ítem/pedido + `social` preguntas públicas y reseñas
  verificadas al `completado`). Pendientes de infra que arrastra M5: **worker +
  Valkey** (vencer reservas I-5 + `stock.changed`), el **`consumed`** (venta) del
  flujo de entrega en M6, y la **captura** del pago (policy media→pedido).
- **Relacionado:** ROADMAP M5 (M5a–M5d), `data-model.md` §3 (payments), §5 (P-1…P-3),
  §6, D-03/D-10; entradas de M5a y M5b.

## 2026-11-02 · `dee714c` · feat — M5b: máquina de estados del pedido + reserva de stock

- **Qué:** segunda rebanada de **M5 · Pedido end-to-end**. El pedido deja de ser un
  libro de solo inserción: ahora se mueve por la **máquina de estados** (§6). Nuevo
  endpoint `POST /v1/orders/{id}/transition` que valida la arista (dominio),
  aplica el **efecto sobre el stock** (reserva al `aceptado`, libera al cancelar) y
  deja la transición en la **bitácora inmutable** (O-2). Se agrega la tabla
  `inventory.reservations` (M3 diferido, atada a pedidos) con su proyección a
  `stock_levels.reserved`. En la web, el Seller mueve el pedido desde la ficha
  (aceptar / rechazar / marcar listo) y el Maker puede cancelar. **Salida de M5b:
  el Seller lleva un pedido hasta `listo`.**
- **Por qué:** cumple la _salida_ de M5b del roadmap y engancha pedidos ↔ inventario
  (O-3/I-5): aceptar un pedido reserva stock sin sobreventa; cancelarlo lo devuelve.
- **Impacto / archivos:**
  - `packages/contracts/src/orders.ts`: `OrderActor`, **`ORDER_TRANSITIONS`** (tabla
    §6, fuente única: arista + actor), `OrderTransitionInput`. `inventory.ts`:
    `ReservationStatus`. (+exports en `index.ts`.)
  - `packages/db/src/schema/inventory.ts`: tabla `reservations`. Migración
    `0022_lonely_venus.sql`: tabla + CHECKs + índice parcial `where status='active'`
    + **trigger `tg_project_reservation`** (SECURITY DEFINER: al `active` sube
    `reserved` **solo si hay disponible** —`on_hand - reserved >= qty`—, al
    `released`/`consumed` lo devuelve) + RLS/grants (SELECT/INSERT/UPDATE a `app`;
    visible/escribible por el Maker del pedido o un miembro de la tienda). Además
    **amplía `orders`**: `GRANT UPDATE`, policy `orders_update` (Maker o miembro) y
    reescribe `order_events_insert` para admitir a la tienda (antes solo el Maker).
  - `packages/core/src/modules/inventory/infra/reservations.ts`: `reserveForOrder`
    (idempotente, pre-chequea disponibilidad → `insufficient`) / `releaseForOrder`
    (+exports). Solo reserva variantes con stock **rastreado**.
  - `packages/core/src/modules/orders/`: `domain/transitions.ts`
    (`canTransition`/`nextStatuses`/`transitionsFor`/`stockEffect`, puro; +test 5/5),
    `infra/order-repo.ts` (`transitionOrder`: valida arista → efecto de stock vía la
    **API pública de `inventory`** → `UPDATE status` → evento), `http/routes.ts`
    (`POST /orders/{id}/transition`: allowlist M5b + actor por arista), `index.ts`.
  - `apps/web`: `lib/orders.ts` (`getStoreOrders`, `orderActions` derivadas de
    `ORDER_TRANSITIONS`), `_components/order-actions.tsx` (botonera cliente),
    `_components/store-orders.tsx` (pedidos recibidos), cableado en
    `comprar/pedidos/[id]` (acciones según rol del viewer) y `mi-tienda/[id]`.
- **Decisiones de diseño:**
  - **Máquina en contracts, lógica en domain:** `ORDER_TRANSITIONS` (grafo + actor)
    es la fuente única; `@3b/core/orders/domain` agrega las funciones puras y el
    `stockEffect`; la web filtra por actor para los botones. Sin duplicar el grafo.
  - **`reservations` la escribe `inventory`, no `orders`:** orders invoca
    `reserveForOrder`/`releaseForOrder` por el `index.ts` de inventory (regla
    "un módulo importa solo el index de otro"). Nadie escribe tablas ajenas.
  - **Proyección por trigger definer:** `app` no escribe `stock_levels`; el trigger
    (owner) sube/baja `reserved`. El `UPDATE` condicionado (`>= qty`) es el candado
    final de no-sobreventa; el servicio pre-chequea para devolver **409** limpio.
  - **Actor por arista en la capa http** (Seller = miembro de la tienda; Maker =
    dueño; `system` no se dispara por API), con la **RLS como candado** (solo un
    involucrado puede actualizar el pedido / insertar evento / escribir reserva).
  - **Allowlist M5b:** el endpoint solo habilita `aceptado`/`rechazado`/`listo`
    (Seller) y `cancelado` (Maker). Las aristas de **pago** (`pago_*`) van a **M5c**
    y las de **entrega/retiro** (`en_envio`/`entregado`/`retirado`/`completado`) a
    **M6**. El `expires_at` ya se graba pensando en el worker.
  - **`consumed` (descuento real de `on_hand`) diferido a M6:** al `listo` el stock
    queda **reservado**; la venta se concreta con la entrega/PIN (M6).
  - **Worker + Valkey diferidos** a una rebanada de infra propia (vencimiento
    automático de reservas I-5 + `stock.changed`); M5b es 100% síncrono, que es lo
    que pide su _salida_. También es el pendiente que arrastra M3.
- **Verificación:** `pnpm check` **verde** (typecheck 10/10, unit **19/19** con
  transitions 5/5, boundaries **353 módulos** sin violaciones). `pnpm
  test:integration`: db 6/6 + **core 76/76** (+5 de M5b: reserva al aceptar,
  liberación al cancelar, transición inválida, llega a `listo`, RLS tercero no mueve).
  Smoke HTTP: Carlos (Seller) acepta el pedido demo → `reserved` 0→1; inválida
  (`aceptado→completado`) 400; Carlos intentando `cancelado` (arista del Maker) **403**;
  Lucía (Maker) cancela 200 → `reserved` 1→0; Pedro (tercero) **404**.
- **Estado para retomar:** **M5b cerrado** (el Seller mueve el pedido hasta `listo`,
  reservando/liberando stock). Siguiente: **M5c — pago por comprobante** (`payments`:
  `payment_reports` con referencia única P-1, `fx_rate_ves` congelado P-2, confirmar/
  rechazar del Seller → `pago_reportado`/`pago_confirmado`/`pago_rechazado`). Al
  habilitar M5c hay que **ampliar el allowlist** del endpoint de transición. Pendiente
  de infra: **worker + Valkey** (vencer reservas + `stock.changed`) y el **`consumed`**
  (venta) del flujo de entrega en M6.
- **Relacionado:** ROADMAP M5 (M5a–M5d), `data-model.md` §3 (orders/reservations),
  §5 (O-1…O-4, I-5), §6 (máquina de estados); entradas de M5a y M3 r1.

## 2026-11-01 · `7033eb9` · feat — M5a: carrito + checkout (módulo `orders`)

- **Qué:** arranca **M5 · Pedido end-to-end** con su primera rebanada, **M5a**.
  Módulo nuevo `orders`: el Maker arma un carrito (cliente, multitienda) y hace
  **checkout de una tienda** → se crea **un pedido por tienda** en estado
  `realizado`, con sus líneas de **título/SKU/precio congelados** (O-1), snapshot de
  dirección (si es envío) y bitácora inicial (`→ realizado`). La creación exige
  `Idempotency-Key` (O-4): un reintento con la misma clave devuelve el pedido ya
  creado (200) en vez de duplicarlo.
- **Por qué:** cumple la _salida_ de M5a del roadmap ("un Maker crea un pedido
  `realizado` desde el carrito"). Deja la base del dominio de pedidos sobre la que
  M5b montará la máquina de estados y la reserva de stock.
- **Impacto / archivos:**
  - `packages/contracts/src/orders.ts` (+export): `OrderStatus` (enum completo de
    la máquina §6), `OrderFulfillment`, `Order`/`OrderItemLine`/`OrderEvent`,
    `OrderAddressSnapshot`, `CreateOrderInput`/`CheckoutLineInput`, `OrderList`.
  - `packages/db/src/schema/orders.ts` (+`index.ts`): `orderRecords`
    (`orders.orders`), `orderItems`, `orderEvents`. Migración
    `0021_broken_the_leader.sql`: tablas + FKs + índices + `number` identity
    (START 1000) + **RLS** (ve el Maker dueño o miembro de la tienda; crea solo el
    Maker, en comunidad visible) + grants (incl. `USAGE` sobre las secuencias) +
    CHECKs de estado/entrega/montos. `reset.ts`: suma `orders` a los esquemas a
    dropear.
  - `packages/core/src/modules/orders/`: `domain/pricing.ts` (montos en **centavos
    enteros**, `computeTotals`; +test unit 5/5), `infra/order-repo.ts`
    (`createOrder` idempotente + congelado + evento; `getOrder`/`listMyOrders`/
    `listStoreOrders`), `http/routes.ts` (router OpenAPI), `index.ts`. `@3b/db`
    exporta `desc`. `apps/api` monta `ordersRouter()`.
  - `apps/web`: `_components/cart-provider.tsx` (carrito en localStorage),
    `cart-provider` montado en el shell, `CartLink` + "Mis pedidos" en la navbar,
    `_components/item-buy.tsx` ("Agregar al carrito" en la ficha),
    `(shell)/comprar/carrito` (checkout por tienda con `Idempotency-Key`),
    `(shell)/comprar/pedidos` + `[id]` (mis pedidos), `lib/orders.ts`.
  - `packages/db/src/seed.ts`: pedido de ejemplo (Lucía compra 1 taladro en la
    Ferretería, `realizado`).
- **Decisiones de diseño:**
  - **Carrito del cliente, no en la base:** el modelo de datos no tiene tabla de
    carrito; es efímero del comprador (localStorage). Un pedido por tienda ("un
    pedido por tienda" del roadmap); el checkout dispara un `POST /v1/orders` por
    tienda, cada uno con su `Idempotency-Key`.
  - **Idempotencia por `(maker_id, idempotency_key)`** (único). El repo pre-chequea
    y devuelve el existente; el único es el candado final ante carreras.
  - **`community_id` desde la tienda (D-05):** el repo lo toma de `store` (visible
    bajo RLS) al crear; sin trigger, y la RLS de alta exige `can_see_community`.
  - **`fx_rate_ves` diferido a M5c:** la columna existe pero queda nula hasta que
    M5c traiga `fx_rates` (P-2).
  - **Sin reserva de stock en M5a:** `realizado` no toca inventario; la reserva va
    al `aceptado` (O-3), en M5b.
- **Verificación:** `pnpm check` **verde** (lint, typecheck 10/10, unit **14/14**
  con pricing 5/5, boundaries 348 módulos sin violaciones). `pnpm test:integration`:
  db 6/6 + **core 71/71** (+4 de orders: creación con precios congelados,
  idempotencia, línea inválida, RLS tienda-ve/tercero-no). Smoke HTTP: login →
  `POST /v1/orders` 201 (#1002, subtotal 149.70 = 49.90×3), repetido con la misma
  clave 200 (mismo pedido), sin clave 400; `GET /v1/orders` (Lucía ve 3),
  `GET /v1/stores/{id}/orders` (Carlos ve 3, todas de Lucía), Pedro (no miembro) 403.
- **Estado para retomar:** **M5a cerrado**. Siguiente: **M5b** — máquina de estados
  (`realizado→aceptado→rechazado/expirado→…→listo`) con transiciones válidas (§6),
  **reserva/liberación de stock** (engancha `reserved`/`reservations` de M3) y
  bitácora inmutable por transición; enciende **worker + Valkey**. Para M5b habrá
  que **ampliar grants/policies** de `orders` (UPDATE del estado + INSERT de eventos
  por miembros de la tienda) en una migración nueva.
- **Relacionado:** ROADMAP M5 (M5a–M5d), `data-model.md` §3 (orders), §5 (O-1…O-4),
  §6 (máquina de estados), D-05; entradas de M3 r1 (inventory) y M4.

## 2026-11-01 · `95a0fb4` · feat — M4 rebanada 5: cercanía (vecinas) + orden local-first

- **Qué:** el feed de descubrimiento ahora ordena **local-first**: primero los ítems
  de la **comunidad propia** del usuario, luego los de **comunidades vecinas**
  (`community.community_links`), luego el resto; dentro de cada grupo, por relevancia
  (si hay `q`) y recencia. La proximidad se calcula por usuario con un CTE sobre sus
  membresías + los links de vecindad (todo bajo RLS). Sin migración (solo orden).
- **Por qué:** cierra "encuentra y ve ítems/tiendas de su comunidad **(y vecinas)**"
  y el "ranking básico" del roadmap M4, con un marketplace local-first.
- **Impacto / archivos:** `packages/core/src/modules/catalog/infra/discovery-repo.ts`
  (`searchItems`: CTE `me`/`near` + expresión de proximidad en el `ORDER BY`);
  `packages/core/test/integration/discovery.test.ts` (+1 orden local-first).
- **Decisiones de diseño:**
  - **Proximidad inline, sin tabla de scores:** 0 = comunidad propia, 1 = vecina, 2 =
    otra; se antepone al orden por relevancia/recencia. Es por-usuario (deriva de sus
    membresías), así que Lucía (Coro) ve primero lo de Coro y Pedro (Punto Fijo) lo
    de Punto Fijo. Los CTE `me`/`near` quedan sujetos a la RLS de membresías/links.
  - **`ranking.item_scores` diferido a post-M5:** la proyección con conversión/calidad/
    novedad necesita datos de **pedidos y reseñas** (M5+); hoy el "ranking básico" es
    proximidad + recencia (+ relevancia en búsqueda). Evita una tabla hueca.
- **Verificación:** `pnpm check` verde (boundaries 334 módulos, unit 9/9);
  integración db 6/6 + **core 67/67** (+1 orden local-first: propia antes que vecina);
  smoke HTTP 2/2 (Lucía ve taladro/Coro antes que corte/Punto Fijo; Pedro, al revés).
- **Estado para retomar:** **M4 cerrado** (feed, ficha ítem, storefront, facetas,
  local-first). Pendiente de M4 solo la proyección `ranking.item_scores` (post-M5).
  Siguiente hito: **M5 pedidos** — carrito/checkout (`commerce.orders` + idempotencia
  + snapshots) que **reserva stock** (engancha el `reserved` de M3 + `reservations`)
  y **enciende worker + Valkey**.
- **Relacionado:** ROADMAP M4 ("y vecinas", "ranking básico"), entradas de M4 r1–r4,
  community_links (seed de vecindad).

## 2026-11-01 · `a0eb5b2` · feat — M4 rebanada 4: filtros por atributo (facetas)

- **Qué:** filtros dinámicos por valor de atributo. Proyección `catalog.item_attr_index`
  (una fila por `item_id`+`key`, con `value_text` y `value_num`), mantenida por un
  **trigger** desde `items.attributes`. El feed acepta `attrs=key:value;key:value`
  (AND, match exacto) y `GET /v1/discovery/facets` devuelve los valores disponibles
  con conteo para el contexto de búsqueda (solo publicados visibles). Web: panel de
  facetas toggleable en **Comprar** (cada valor es un chip que agrega/quita un
  `attr` en la URL). Seed: taladro con `{marca:Bosch, voltaje:650, garantia_meses:12}`.
- **Por qué:** la "filtros dinámicos" del roadmap M4 — refinar el feed por atributos
  sin hardcodear facetas (se derivan del catálogo real).
- **Impacto / archivos:** `packages/contracts/src/catalog.ts` (`AttrFilter` + `attrs`
  en `DiscoveryQuery`; `DiscoveryFacet`/`DiscoveryFacets`) + exports;
  `packages/db/src/schema/catalog.ts` (`itemAttrIndex`) + migración
  `0020_young_nightcrawler.sql` (tabla + **RLS derivada del ítem** + grants +
  **trigger de reindexado** + backfill); `packages/db/src/seed.ts` (atributos en
  ítems + resumen `attrIndex=`); `packages/core/src/modules/catalog`
  (`discovery-repo` `getFacets` + filtro `attrs` en `searchItems`; `discovery-routes`
  ruta de facets + parseo `attrs`; exports); `apps/web` (`lib/catalog`
  getDiscoveryFacets + `attrs`, componente `discovery-facets`, panel en Comprar);
  `packages/core/test/integration/facets.test.ts`.
- **Decisiones de diseño:**
  - **Proyección por trigger (como stock/attr-index):** `item_attr_index` es solo
    lectura para la app; el trigger `tg_reindex_item_attrs` (SECURITY DEFINER) la
    reconstruye en cada insert/update de `attributes` (`DELETE` + `INSERT ... FROM
    jsonb_each`). `value_text = value #>> '{}'` (escalar sin comillas para cualquier
    tipo); `value_num` solo si es número (para rangos futuros). Backfill de los
    existentes en la migración.
  - **Facetas por `key` (no por `attribute_id`):** `items.attributes` se indexa por
    la **clave**; alcanza para filtrar/facetear y evita resolver definiciones. Las
    facetas se computan sobre el filtro base (comunidad/tienda/categoría/tipo/`q`)
    **sin** aplicar los filtros de atributo → se ven todas las opciones.
  - **Filtro AND por `EXISTS`:** cada `key:value` agrega un `EXISTS` sobre el índice;
    el valor va **parametrizado** (sin inyección). `attrs` viaja como un string
    `key:value;…` (evita el parseo de params repetidos de query).
  - **RLS:** `item_attr_index` se ve si se ve su ítem (igual que stock/variantes);
    las facetas y el filtro quedan acotados a publicados visibles por la RLS de items.
- **Verificación:** `pnpm check` verde (boundaries 334 módulos, unit 9/9);
  integración db 6/6 + **core 66/66** (+3 facets: facetas solo de publicados,
  filtro exacto, AND); seed `attrIndex=4` (trigger pobló el índice); smoke HTTP 7/7
  (Bosch en facetas, Stanley/borrador no, filtro exacto, AND contradictorio vacío).
- **Estado para retomar:** falta de M4: **vecinas** (`community_links`) y `ranking`.
  Luego **M5 pedidos**.
- **Relacionado:** ROADMAP M4 ("filtros dinámicos"), entradas de M4 r1–r3, catalog 2c
  (valores de atributo).

## 2026-11-01 · `e9717b4` · feat — M4 rebanada 3: ficha pública de tienda (storefront)

- **Qué:** storefront público. `GET /v1/discovery/stores/{id}` devuelve la tienda
  (nombre/slug/tipo/**verificada**/comunidad) + **horario** + **ítems publicados**.
  Se agregó el filtro `storeId` a `searchItems` (y a `DiscoveryQuery`) y se reusa
  para traer los ítems de la tienda. Web: página `/comprar/tienda/[id]` (cabecera +
  horario por día + grilla de ítems que enlazan a la ficha); la ficha de ítem ahora
  enlaza al storefront por el nombre de la tienda. 404 si no es visible.
- **Por qué:** completa "ver ítems/tiendas" del salida de M4 — el comprador llega a
  la vitrina de una tienda desde un ítem o el feed.
- **Impacto / archivos:** `packages/contracts/src/catalog.ts` (`PublicStore` +
  `storeId` en `DiscoveryQuery`; importa `StoreHour`/`StoreKind`) + exports;
  `packages/core/src/modules/catalog` (`discovery-repo` `getPublicStore` + filtro
  `storeId` en `searchItems`; `discovery-routes` ruta + schema; exports); `apps/web`
  (`lib/catalog` getPublicStore, página `comprar/tienda/[id]`, enlace en la ficha de
  ítem); `packages/core/test/integration/public-store.test.ts`. Sin migración.
- **Decisiones de diseño:**
  - **Reusa `searchItems({storeId})`** para los ítems del storefront (mismo filtro
    `status='published'` + RLS): una sola fuente de verdad para "ítems visibles".
  - **Horario público** ya existía (M2 r4: `store_hours_select` deriva del store);
    el storefront lo expone tal cual a compradores. Verificada = `verification_level`.
  - **404 por RLS** (store no visible → `getPublicStore` null), sin filtrar existencia.
- **Verificación:** `pnpm check` verde (boundaries 317 módulos, unit 9/9);
  integración db 6/6 + **core 63/63** (+2 storefront: tienda con publicados (sin
  borradores) y verificada; horario presente); smoke HTTP 6/6 (verificada, solo
  publicados, horario, 404).
- **Estado para retomar:** falta de M4: **filtros por atributo** (`item_attr_index`),
  **vecinas** (`community_links`) y `ranking`. Luego **M5 pedidos**.
- **Relacionado:** ROADMAP M4, entradas de M4 r1/r2, store r4 (horarios), KYC (verificada).

## 2026-11-01 · `abb02ca` · feat — M4 rebanada 2: ficha pública de ítem

- **Qué:** ficha pública de un ítem para el comprador. `GET /v1/discovery/items/{id}`
  devuelve el ítem + **tienda** (nombre/slug/verificada) + **comunidad** + **imágenes**
  (URLs) + **variantes con disponibilidad** (`available = on_hand − reserved`) +
  **detalle de servicio**; 404 si no es visible. Dos policies de descubrimiento:
  `media_select_item` (el comprador ve las fotos de un ítem visible) y
  `stock_levels_select_public` (ve la disponibilidad de un publicado). Web: página
  `/comprar/[id]`; las tarjetas del feed ahora enlazan a la ficha.
- **Por qué:** cerraba el hueco de M4 r1 — el feed no enlazaba a nada. Un Maker ahora
  **ve** el ítem completo (fotos, SKUs, stock, servicio, tienda), no solo lo encuentra.
- **Impacto / archivos:** `packages/contracts/src/catalog.ts` (`PublicItem`/
  `PublicItemVariant`) + exports; migración **custom** `0019_media_item_visibility.sql`
  (`drizzle-kit generate --custom`): policies `media_select_item` +
  `stock_levels_select_public`; `packages/core/src/modules/catalog`
  (`infra/discovery-repo.ts` `getPublicItem`, `http/discovery-routes.ts` con la ruta
  + `DiscoveryRouterOptions.mediaPublicUrl` inyectado, exports); `apps/api` (pasa
  `mediaStorage.publicUrl` al `discoveryRouter`); `apps/web` (`lib/catalog`
  getPublicItem, página `comprar/[id]`, enlace en el feed);
  `packages/core/test/integration/public-item.test.ts` (+ actualización de
  `inventory.test.ts`).
- **Decisiones de diseño:**
  - **Visibilidad de descubrimiento por policies permissive** (como `media_select_kyc`):
    una media `owner_type='item'` y un `stock_levels` se LEEN si la variante→ítem es
    visible (la subconsulta queda sujeta a la RLS de `items` → publicado en comunidad
    visible, o miembro). **Esto amplía** la visibilidad de stock de M3 (antes
    solo-miembros): ahora el comprador ve `available` de publicados (la API solo
    expone `available`, no datos operativos crudos). Se actualizó el test de
    inventario acorde.
  - **`mediaPublicUrl` inyectado al router** (como `paymentsEncKey`): la ficha arma
    las URLs de imágenes sin que `catalog` dependa de `media`/storage; `apps/api`
    (que conoce todo) pasa `mediaStorage.publicUrl`.
  - **404 por RLS**, no por gate explícito: si el ítem no es visible, `getPublicItem`
    devuelve null → 404 (no filtra existencia). Reúne ítem/variantes/servicio/imágenes
    con consultas acotadas por RLS.
  - **Migración `--custom`** para policies sin cambio de esquema: deja journal +
    snapshot consistentes sin editar meta a mano.
- **Verificación:** `pnpm check` verde (boundaries 315 módulos, unit 9/9);
  integración db 6/6 + **core 61/61** (+3 ficha: producto con tienda/variantes/stock,
  servicio con su detalle, borrador → null; + ajuste de inventario a la nueva
  visibilidad); smoke HTTP 7/7 (owner sube imagen → comprador la ve en la ficha y por
  `/media/{id}`, variantes con disponibilidad, borrador 404).
- **Estado para retomar:** falta de M4: **filtros por atributo** (`item_attr_index`),
  **ficha de tienda** (storefront), **vecinas** (`community_links`) y `ranking`.
  Luego **M5 pedidos** (reservas + worker/Valkey).
- **Relacionado:** [data-model §4/§discovery](architecture/data-model.md), ROADMAP M4,
  entradas de M4 r1 (feed/búsqueda), media (núcleo) e inventario (disponibilidad).

## 2026-11-01 · `3e91ddd` · feat — M4 rebanada 1: descubrimiento (feed + búsqueda de ítems)

- **Qué:** descubrimiento público de ítems. Endpoint `GET /v1/discovery/items`
  (`q`, `communityId`, `categoryId`, `kind`, `limit`/`offset`) que devuelve solo
  ítems **publicados** en comunidad visible, con **nombre de tienda y comunidad**
  para la ficha. Búsqueda full-text sobre una columna generada `catalog.items.
  search_tsv` (español, **sin acentos**) + GIN, combinada con pg_trgm (ILIKE sin
  acentos, tolera tipeos) y ordenada por relevancia (`ts_rank`) y recencia; sin `q`
  es el feed por recencia. Web: página **Comprar** con buscador (texto + tipo) y
  grilla de resultados.
- **Por qué:** primer entregable de M4 — un Maker encuentra y ve ítems publicados de
  su comunidad. Estrena el lado comprador (espacio "Comprar") sobre el catálogo.
- **Impacto / archivos:** `packages/contracts/src/catalog.ts` (`DiscoveryItem`/
  `DiscoveryItemList`/`DiscoveryQuery`) + exports; `packages/db/src/schema/catalog.ts`
  (customType `tsvector` + columna generada `searchTsv` + índice GIN) + migración
  `0018_brave_bug.sql` (función immutable `catalog.f_unaccent` + columna GENERADA +
  GIN full-text + GIN pg_trgm sobre el título sin acentos);
  `packages/core/src/modules/catalog` (`infra/discovery-repo.ts` `searchItems`,
  `http/discovery-routes.ts`, exports); `apps/api` (monta `discoveryRouter`);
  `apps/web` (`lib/catalog` getDiscoveryItems, componente `discovery-search`, página
  `comprar`); `packages/core/test/integration/discovery.test.ts`.
- **Decisiones de diseño:**
  - **Descubrimiento en el módulo catalog** (dueño de `items`): es el lado de lectura
    del catálogo, sin cruzar propiedad de tablas. Los joins a `store.stores`/
    `community.communities` son lectura (RLS los acota igual).
  - **`search_tsv` como columna GENERADA + `f_unaccent` immutable:** la `unaccent` de
    la extensión es STABLE y no sirve en columnas/índices generados; se envuelve en
    `catalog.f_unaccent` (IMMUTABLE, diccionario explícito). `to_tsvector('spanish',
    …)` con config literal es immutable → columna STORED válida, poblada para las
    filas existentes al crearse. GIN para full-text; **pg_trgm** aparte sobre
    `f_unaccent(title)` para ILIKE/similaridad difusa.
  - **Solo publicados, por RLS + filtro:** la RLS de `items` ya limita a publicados
    en comunidad visible para no-miembros; el repo **además** filtra
    `status='published'` para que un miembro no vea sus borradores en el feed
    (descubrimiento = vista pública). Búsqueda = `search_tsv @@ websearch_to_tsquery`
    **OR** `f_unaccent(title) ILIKE %q%`.
  - **Paginación con `limit+1`:** se pide uno de más para calcular `hasMore` sin un
    COUNT aparte. Query dinámica con fragmentos `sql` (condiciones + orderBy).
  - **Diferidos:** filtros por atributo (necesitan `item_attr_index`), ficha pública
    de ítem/tienda (no hay página pública de ítem aún), comunidades **vecinas**
    (`community_links`; hoy el alcance es comunidad propia/pública vía
    `can_see_community`) y `ranking.item_scores` (orden hoy = relevancia+recencia).
- **Verificación:** `pnpm check` verde (boundaries 313 módulos, unit 9/9);
  integración db 6/6 + **core 58/58** (+5 descubrimiento: texto encuentra publicados,
  unaccent, filtro por tipo, borradores nunca aparecen (ni al dueño), feed por
  recencia); smoke HTTP 11/11 (401 sin sesión, feed, texto, unaccent "taladró",
  kind, borrador oculto, sin-resultados, `limit=1`+`hasMore`).
- **Estado para retomar:** M4 r1 entrega feed/búsqueda. Siguiente: **ficha pública
  de ítem** + **filtros por atributo** (`item_attr_index`) + **vecinas** + `ranking`;
  o saltar a **M5 pedidos** (carrito/checkout + reservas de stock, enciende
  worker+Valkey).
- **Relacionado:** [data-model §4/§discovery](architecture/data-model.md), ROADMAP M4,
  [diccionario de objetos](../.docs/3B_diccionario_de_objetos.md) (§ranking/analytics),
  entrada de catalog 1 (ítems) y M3 r1 (inventario).

## 2026-11-01 · `1c8be4c` · feat — M3 rebanada 1: inventario (existencias + movimientos)

- **Qué:** módulo nuevo `inventory`. **Existencias** (`inventory.stock_levels`,
  proyección por variante: `on_hand`/`reserved`/`low_threshold`/`version`;
  `available = on_hand - reserved`) + **movimientos** (`inventory.stock_movements`,
  **libro de solo inserción**: `kind` receipt|sale|adjustment|return, `channel`,
  `qty` con signo, `reference`, `idempotency_key`, `created_by`). Un **trigger**
  proyecta el nivel desde cada movimiento (no-sobreventa por CHECK). API anidada:
  `GET /v1/stores/{id}/items/{itemId}/stock` (niveles por variante), `GET/POST
  .../variants/{variantId}/movements` (libro + aplicar). Web: sección **Inventario**
  en el detalle de ítem (disponible/físico por variante + alta de movimiento /
  mostrador). Seed: el taladro arranca con stock (negro 20, azul 12).
- **Por qué:** arranca M3 con el corazón del inventario (ledger + proyección) que
  habilita el mostrador y, más adelante, las reservas (M5) y el stock en vivo.
- **Impacto / archivos:** `packages/contracts/src/inventory.ts`
  (`StockMovementKind`/`StockChannel`/`StockLevel(+List)`/`StockMovement(+List)`/
  `ApplyStockMovementInput`) + exports; `packages/db/src/schema/inventory.ts`
  (`stockLevels`/`stockMovements`) + `schema/index.ts` + `reset.ts` (dropea
  `inventory`) + migración `0017_happy_orphan.sql` (schema + 2 tablas + CHECKs +
  índice único de idempotencia + **RLS + grants** + **trigger de proyección**);
  `packages/db/src/seed.ts` (stock inicial + resumen `stock=`);
  `packages/core/src/modules/inventory/**` (domain `validate-movement` + unit test,
  infra `inventory-repo` con `applyMovement`, http router) + `@3b/core` export map;
  `apps/api` (monta `inventoryRouter`); `apps/web` (`lib/catalog` getItemStock,
  componente `item-stock`, wiring); `packages/core/test/integration/inventory.test.ts`.
- **Decisiones de diseño:**
  - **Ledger + proyección por trigger:** el movimiento (inmutable) es la fuente de
    verdad; un trigger `SECURITY DEFINER` mantiene `stock_levels`. La app solo tiene
    **SELECT** sobre `stock_levels` (la escribe el trigger) y **SELECT/INSERT** sobre
    `stock_movements` (nunca UPDATE/DELETE): el libro es a prueba de manipulación.
  - **Trigger UPDATE-primero-luego-INSERT (no `ON CONFLICT`):** _bug atrapado por los
    tests_ — con `INSERT … ON CONFLICT DO UPDATE`, Postgres evalúa el CHECK sobre la
    **tupla propuesta** del INSERT **antes** de resolver el conflicto, así que un
    movimiento negativo (VALUES `on_hand<0`) sobre una variante que ya tenía nivel
    fallaba el `on_hand>=0` aunque el update diera positivo. Se reescribió a
    UPDATE-primero (el delta solo se chequea ya sumado) + INSERT con reintento ante
    carrera del primer alta.
  - **No-sobreventa en capas:** el servicio pre-chequea `on_hand + qty ≥ 0` y
    devuelve **409** (mensaje claro); el CHECK `on_hand>=0` es el candado final ante
    carreras (→ 400 raro). **Idempotencia** por `idempotency_key` único: misma clave
    ⇒ no re-aplica (devuelve el movimiento ya hecho).
  - **Signo del delta validado en dominio** (`validate-movement`, puro + unit test):
    receipt/return > 0, sale < 0, adjustment cualquiera (≠0).
  - **RLS derivada de variante→ítem→tienda:** ver stock = cualquier miembro; mover
    stock = owner/admin/catalog. El handler además verifica que la variante sea de la
    tienda de la ruta (404).
  - **Reservas y worker/Valkey diferidos:** `reserved` ya existe (default 0) pero su
    flujo (vencimiento, `stock.changed`, liberar al expirar) requiere el worker +
    Valkey, aún no encendidos; las reservas se crean al realizar un pedido (M5).
- **Verificación:** `pnpm check` verde (boundaries 306 módulos, **unit 9/9** con +4
  del dominio de movimientos); integración db 6/6 + **core 53/53** (+4 inventario:
  receipt/sale proyectan, no-sobreventa, idempotencia no re-aplica, sales no mueve
  stock (RLS) y no-miembro no ve el nivel); smoke HTTP 14/14 (receipt/sale,
  signo 400, sobreventa 409, idempotente, variante ajena 404, sales 403/ve 200).
- **Estado para retomar:** M3 r1 cierra el ledger. Siguiente: **M4 descubrimiento**
  (feed + búsqueda `pg_trgm`/`search_tsv` + `item_attr_index`) o **M5 pedidos** (que
  traerá las **reservas** de stock); el **worker + Valkey** se enciende cuando el
  primer consumidor (reservas/outbox) lo pida.
- **Relacionado:** [diccionario de objetos](../.docs/3B_diccionario_de_objetos.md)
  (local, §inventory), [data-model §inventory y §7](architecture/data-model.md),
  ROADMAP M3, entrada de catalog 2d (variantes, de donde cuelga el stock).

## 2026-11-01 · `43889ac` · feat — M2 store rebanada 5: verificación (KYC)

- **Qué:** **verificación KYC de tiendas** (`identity.kyc_submissions`, polimórfica
  `subject_type`/`subject_id`; M2 usa `store`) + columna `stores.verification_level`
  (`none|verified`). Flujo: el equipo de la tienda (owner/admin) **envía** una
  verificación (`doc_type` + documento opcional en `media`) → el **admin de la
  comunidad** de la tienda la ve en su **cola** y la **aprueba/rechaza** → un
  **trigger** fija el `verification_level`. Endpoints: `POST/GET
  /v1/stores/{id}/kyc`, `GET /v1/communities/{id}/kyc` (cola), `POST
  /v1/kyc/{id}/review`. Además `GET /v1/media/{id}` (nuevo) para ver el documento.
  Seed: ferretería **aprobada** (→ verified, revisada por Ana) y peluquería
  **pendiente** en cola.
- **Por qué:** cierra `kyc_submissions` del mapa y da la verificación de tiendas que
  el Playbook pide para el piloto; estrena la capacidad de **revisión del admin de
  comunidad**. Era el último objeto grande de M2 en store.
- **Impacto / archivos:** `packages/contracts/src/identity.ts` (`KycSubjectType`/
  `KycDocType`/`KycStatus`/`KycSubmission(+List)`/`CreateKycSubmissionInput`/
  `ReviewKycInput`), `store.ts` (`StoreVerificationLevel` + `Store.verificationLevel`)
  + exports; `packages/db/src/schema/identity.ts` (`kycSubmissions`), `store.ts`
  (`verificationLevel`) + migración `0016_strong_ser_duncan.sql` (tabla + columna +
  CHECKs + **RLS en capas** + FK blanda a media + **trigger** KYC→verification_level
  + **política `media_select_kyc`**); `packages/db/src/seed.ts` (2 verificaciones +
  resumen `kyc=`); `packages/core/src/modules/identity` (`infra/kyc-repo.ts`,
  `http/kyc-routes.ts` con 4 rutas, exports); `media` (`getMediaById` + `GET
  /v1/media/{id}`); `store` (`toStore`/`storeOut` con verificationLevel); `apps/api`
  (monta `kycRouter`); `apps/web` (`lib/stores` getStoreKyc, componente `store-kyc`
  con subida de documento en dos fases, wiring + badge en la página de tienda);
  `packages/core/test/integration/kyc.test.ts`.
- **Decisiones de diseño:**
  - **`verification_level` lo fija un trigger** `SECURITY DEFINER` (identity→store,
    `AFTER INSERT OR UPDATE OF status`): aprobar→`verified`, rechazar→`none`. Evita
    que el core de identity escriba en `store.stores` (cruce de módulos); es atómico
    con el cambio de estado. Mismo patrón que el trigger de `community_id` (D-05).
  - **RLS en capas, derivada del store:** `kyc_select` deja ver una verificación de
    tienda al equipo (owner/admin), al **admin de su comunidad** (revisor) y al admin
    de plataforma. `kyc_insert` fuerza `status='pending'` y `reviewer_id IS NULL`
    (el que envía **no puede auto-aprobarse**). `kyc_update` (la revisión) solo la
    permite el **admin de la comunidad** del sujeto. El handler de review además
    resuelve la comunidad y gatea con `isCommunityAdmin` (403 temprano).
  - **Documento = `media` con `owner_type='store'`** (se reusa el flujo de subida,
    autorizado por `canManageStore`). Para que el **revisor vea el documento** sin
    acoplar media→kyc, se agrega una **segunda policy permissive** `media_select_kyc`
    (se combina por OR con `media_select`): una media se ve si existe una
    verificación visible que la referencia (la subconsulta queda sujeta a
    `kyc_select`). **Bug atrapado por el smoke:** `k.media_id = id` resolvía `id` a
    `kyc_submissions.id` (shadowing, la tabla interna también tiene `id`) → siempre
    falso; se calificó `media.media.id`.
  - **Scope M2 = KYC de tiendas.** `subject_type` ya es polimórfico (`store|mover`)
    pero el KYC de **movers** va con M6 (shipping). La UI del **revisor** (consola de
    admin de comunidad) se **difiere** (no hay espacio de comunidad aún); el flujo de
    revisión queda completo por API y probado (integración + smoke). La web entrega
    el lado tienda (enviar + estado + badge verificada).
  - **`GET /v1/media/{id}`** nuevo (RLS-gated): necesario para que submitter y revisor
    resuelvan la URL del documento por id; útil en general.
- **Verificación:** `pnpm check` verde (boundaries 294 módulos, unit 5/5);
  integración db 6/6 + **core 49/49** (+2 KYC: owner envía→admin ve en cola→aprueba
  y el **trigger deja la tienda `verified`**; sales no puede revisar (RLS→null) y un
  no-miembro no la ve); smoke HTTP 11/11 (envío 201, sales 403, cola de comunidad,
  **revisor ve el documento vía media_select_kyc**, owner no revisa 403, aprobar 200
  + store verified, review inexistente 404).
- **Estado para retomar:** store cierra M2 (alta/equipo/pagos/horarios/KYC). Del mapa
  M2 quedan `templates` e `item_attr_index` (con M4), y KYC de movers (M6).
  Siguiente sugerido: **M3 inventario** (`stock_levels`/`stock_movements`/
  `reservations` + worker/Valkey) o **M4 descubrimiento** (feed/búsqueda).
- **Relacionado:** [diccionario de objetos](../.docs/3B_diccionario_de_objetos.md)
  (local, §identity `kyc_submissions`), [data-model §identity y §7](architecture/data-model.md),
  entradas de media (núcleo) y store 3/4.

## 2026-11-01 · `b61759a` · feat — M2 catalog rebanada 2f: colecciones (vitrina)

- **Qué:** **colecciones** (vitrina) de una tienda: `catalog.collections` (título +
  `position`) y la M:N ordenada `catalog.collection_items` (collection_id, item_id,
  `position`). CRUD anidado `GET/POST /v1/stores/{id}/collections`, `PATCH/DELETE
  .../{collectionId}`, y pertenencias `POST .../{collectionId}/items` +
  `DELETE .../items/{itemId}`. El GET devuelve cada colección con sus ítems ya
  embebidos y ordenados. Web: sección **Colecciones** en `/mi-tienda/[id]` (crear,
  borrar, agregar ítems del catálogo, quitar). Seed: la ferretería trae "Destacados"
  con sus 2 productos.
- **Por qué:** cierra el objeto `collections`/`collection_items` del mapa de `.docs`
  y da la vitrina que agrupa ítems para el descubrimiento (M4) y la ficha de tienda.
- **Impacto / archivos:** `packages/contracts/src/catalog.ts` (`CollectionItemRef`/
  `Collection`/`CollectionList`/`CreateCollectionInput`/`UpdateCollectionInput`/
  `AddCollectionItemInput`) + exports; `packages/db/src/schema/catalog.ts`
  (`collections` + `collectionItems`) + migración `0015_heavy_black_panther.sql`
  (2 tablas **+ RLS en capas + grants**); `packages/db/src/index.ts` (re-exporta
  `inArray`); `packages/db/src/seed.ts` ("Destacados" + resumen con `colecciones=`);
  `packages/core/src/modules/catalog/infra/collection-repo.ts` (list con ítems
  embebidos, get, create/update/delete, add/remove ítem) + router (6 rutas) +
  exports; `apps/web` (`lib/catalog` getStoreCollections, componente
  `store-collections`, wiring en la página de tienda);
  `packages/core/test/integration/collection.test.ts`.
- **Decisiones de diseño:**
  - **RLS en dos niveles, derivada del padre** (como variantes/horarios):
    `collections` se ve si se ve el store (`EXISTS store.stores` → pública a la
    comunidad); se gestiona con owner/admin/**catalog**. `collection_items` se ve si
    se ve **su colección Y su ítem** (doble `EXISTS`): así la vitrina de un comprador
    **no filtra ni muestra ítems en borrador** (cada subconsulta queda sujeta a su
    propia RLS). Gestionar pertenencias = catalog-manager de la tienda de la
    colección.
  - **Ítem debe ser de la misma tienda:** la RLS de insert solo exige gestionar la
    colección; el handler además resuelve el ítem con `getItem(storeId, itemId)` y
    responde **404** si no pertenece a esa tienda (evita mezclar catálogos de dos
    tiendas que el mismo usuario administre).
  - **Listado con ítems embebidos (sin N+1):** `listCollections` hace 2 consultas
    (colecciones + sus pertenencias con `inArray`) y agrupa en memoria; se re-exporta
    `inArray` desde `@3b/db` (misma instancia de Drizzle en el workspace).
  - **`title` único por tienda** (`UNIQUE(store_id, title)` → 409) en vez de slug: el
    mapa de `.docs` lista solo "título, orden"; el slug para URLs se puede agregar
    después si M4 lo pide. Editar un tramo de orden = `PATCH position`.
  - **Borrado en cascada:** borrar una colección arrastra sus `collection_items`
    (FK `ON DELETE cascade`); borrar un ítem lo quita de todas sus colecciones.
- **Verificación:** `pnpm check` verde (boundaries 287 módulos, unit 5/5);
  integración db 6/6 + **core 47/47** (+3 de colecciones: owner crea+agrega+lista
  ordenado, un par de comunidad ve la colección pero **solo los ítems publicados**,
  sales bloqueado por RLS al crear/agregar, quitar/borrar); smoke HTTP 12/12 (seed
  2 ítems, alta 201, título repetido 409, ítem de la tienda 201, ítem repetido 409,
  ítem de otra tienda 404, quitar 204→404, borrar 204→404).
- **Estado para retomar:** catalog con taxonomía/atributos/ítems/variantes/servicio/
  **colecciones**. Del mapa M2 quedan `templates` (plantillas de atributos) y
  `item_attr_index` (va con la búsqueda de M4). Siguiente sugerido: **KYC**
  (`identity.kyc_submissions` + `stores.verification_level` + flujo de revisión por
  admin de comunidad, ya usable con `media`); luego **M3 inventario**.
- **Relacionado:** [diccionario de objetos](../.docs/3B_diccionario_de_objetos.md)
  (local, §catalog `collections`/`collection_items`),
  [data-model §catalog](architecture/data-model.md), entradas de catalog 2d
  (variantes) y store 4 (horarios), mismo patrón de RLS derivada del padre.

## 2026-11-01 · `b5d1c06` · feat — M2 store rebanada 4: horarios (disponibilidad semanal)

- **Qué:** **horario semanal** de una tienda (`store.store_hours`) modelado como
  **intervalos de apertura**: cada fila es un tramo (`opens_min`→`closes_min`,
  minutos desde medianoche) en un `weekday` (0=domingo…6=sábado). Varios tramos por
  día = turno partido; un día sin filas = cerrado. CRUD anidado `GET/POST
  /v1/stores/{id}/hours` y `DELETE .../{hourId}`. Web: sección **Horario** en
  `/mi-tienda/[id]` (grilla por día + alta `HH:MM` + borrar). Seed: la peluquería
  abre Lun–Vie 09:00–18:00 y Sáb 09:00–13:00 (6 tramos).
- **Por qué:** cierra el objeto `store_hours` del mapa de `.docs` (disponibilidad);
  es info que el comprador necesita (cuándo está abierta la tienda) y base para
  reservas de servicios más adelante.
- **Impacto / archivos:** `packages/contracts/src/store.ts` (`Weekday`/
  `MinutesOfDay`/`StoreHour`/`StoreHourList`/`CreateStoreHourInput`) + export en
  `index.ts`; `packages/db/src/schema/store.ts` (`storeHours`) + migración
  `0014_yielding_nova.sql` (tabla **+ CHECKs + RLS derivada del store + grants**);
  `packages/db/src/seed.ts` (horario de la peluquería + resumen con `horarios=`);
  `packages/core/src/modules/store/infra/store-hours-repo.ts` (list/create/delete)
  + router (3 rutas) + exports; `apps/web` (`lib/stores` getStoreHours, componente
  `store-hours`, wiring en la página de detalle);
  `packages/core/test/integration/store-hours.test.ts`.
- **Decisiones de diseño:**
  - **Tiempos como minutos enteros desde medianoche** (`opens_min`/`closes_min`,
    0..1440), no `time` ni `numeric`: enteros comparables y validables con un CHECK
    (`closes_min > opens_min`), sin líos de zona horaria. La web formatea a `HH:MM`.
    Mismo criterio que `duration_min` (2e): lo que no es dinero va como número.
  - **Intervalos (una fila por tramo), no una fila por día:** soporta turno partido
    de forma natural. `UNIQUE(store_id, weekday, opens_min)` evita cargar dos veces
    el mismo tramo (→ 409). Editar un tramo = borrar + crear (sin PATCH).
  - **RLS: visibilidad derivada del store** (como `item_variants` del ítem):
    `EXISTS (SELECT 1 FROM store.stores s WHERE s.id = store_id)` queda sujeto a
    `stores_select`, así que **el horario se ve si se ve la tienda** (público a la
    comunidad, no solo a miembros — a diferencia de `payment_methods`, que es
    member-only). Gestionar (crear/borrar) = owner/admin.
  - **Validación `cierre>apertura` en tres capas:** Zod (`refine` en el contrato),
    chequeo en el handler (400 con mensaje claro) y CHECK en la DB (backstop →
    23514 → 400 vía onError). El GET **no gatea** (confía en la RLS), como el listado
    de ítems.
  - **Excepciones por fecha (feriados) diferidas:** el objeto del mapa las menciona
    pero está PROPUESTO; esta rebanada cubre el recurrente semanal y deja las
    excepciones para una tabla/campo posterior si se aprueba.
- **Verificación:** `pnpm check` verde (boundaries 281 módulos, unit 5/5);
  integración db 6/6 + **core 44/44** (+2 de horarios: owner crea/lista + par de
  comunidad los ve (público), sales bloqueado por RLS, borrar); smoke HTTP 9/9
  (seed 6 tramos, alta 201, cierre<=apertura 400, tramo repetido 409, weekday fuera
  de rango 400, delete 204→vuelve a 6, delete inexistente 404).
- **Estado para retomar:** store queda con alta/equipo/pagos/horarios. Siguiente del
  mapa de `.docs`: `collections`/`collection_items` (vitrina, PROPUESTO); **KYC**
  (`identity.kyc_submissions` + `stores.verification_level` + flujo de revisión por
  admin de comunidad, ya usable con `media`); **M3 inventario**.
- **Relacionado:** [diccionario de objetos](../.docs/3B_diccionario_de_objetos.md)
  (local, §store `store_hours`), [data-model §store](architecture/data-model.md),
  entradas de store 3 (métodos de pago, mismo patrón de router) y catalog 2d
  (variantes, mismo patrón de RLS derivada del padre).

## 2026-11-01 · `52d775c` · feat — M2 catalog rebanada 2e: detalle de servicio

- **Qué:** **detalle de servicio** de un ítem (`catalog.service_details`, 1:0..1
  con el ítem): `duration_min`, `modality` (`in_store`|`on_site`|`remote`),
  `coverage_km` (radio, solo con `on_site`) y `notes`. Upsert anidado
  `GET/PUT/DELETE /v1/stores/{id}/items/{itemId}/service`. Solo aplica a ítems
  `kind='service'` (el handler lo exige → 400 si no). Web: sección **Detalle de
  servicio** en la página de detalle del ítem, visible solo para servicios. Seed:
  "Corte y peinado" trae un detalle (45 min, en el local).
- **Por qué:** completa el modelo del ítem de catalog para los servicios, que no
  tenían datos propios (duración/modalidad/cobertura). Cierra el núcleo de catalog.
- **Impacto / archivos:** `packages/contracts/src/catalog.ts` (`ServiceModality`/
  `ServiceDetail`/`UpsertServiceDetailInput`) + export en `index.ts`;
  `packages/db/src/schema/catalog.ts` (`serviceDetails`, `item_id` como PK/FK) +
  migración `0013_nappy_onslaught.sql` (tabla **+ RLS derivada del ítem padre +
  grants**); `packages/db/src/seed.ts` (detalle del corte + resumen con `servicios=`);
  `packages/core/src/modules/catalog/infra/service-detail-repo.ts` (get/upsert/
  delete) + router (3 rutas) + exports; `apps/web` (`lib/catalog` getItemServiceDetail,
  componente `item-service-details`, wiring en la página de detalle);
  `packages/core/test/integration/service-detail.test.ts`.
- **Decisiones de diseño:**
  - **`item_id` como PK** (no un `id` propio): la relación es 1:0..1, así que la PK
    es la FK al ítem. El alta/edición es un **upsert** (`ON CONFLICT (item_id) DO
    UPDATE`); reemplaza, no hace merge (campos ausentes → null).
  - **RLS derivada del ítem padre** (igual que `item_variants`): subconsulta
    `EXISTS (SELECT 1 FROM catalog.items i WHERE i.id = item_id …)` sujeta a la RLS
    de items → el detalle se ve si su ítem se ve; se gestiona si sos owner/admin/
    catalog de la tienda. Sin denormalizar `store_id`.
  - **Gate `kind='service'` en el handler** (no en la RLS/CHECK): la RLS ya no
    conoce el `kind` sin otra subconsulta; el handler resuelve el ítem (`getItem`) y
    rechaza con **400** si es producto. Más claro y con mejor mensaje.
  - **`duration_min`/`coverage_km` como enteros** (no `numeric`): no son dinero;
    minutos y km enteros alcanzan para el MVP. `coverage_km` solo tiene sentido con
    `on_site` (la web oculta el campo en otras modalidades).
- **Verificación:** `pnpm check` verde (boundaries 275 módulos, unit 5/5);
  integración db 6/6 + **core 42/42** (+2 de servicio: upsert crear→reemplazar +
  lectura, sales bloqueado por RLS, no-miembro no ve el detalle de un borrador);
  smoke HTTP 10/10 (GET del seed, upsert on_site, persistencia, 400 en producto,
  400 modality inválida, delete 204→null, delete repetido 404).
- **Estado para retomar:** catalog **cerrado**. Siguiente del mapa de `.docs`:
  `store_hours` (módulo store), `collections`/`collection_items` (vitrina,
  PROPUESTO); **KYC** (`identity.kyc_submissions` + `stores.verification_level` +
  flujo de revisión); **M3 inventario** (`stock_levels`/`stock_movements`/
  `reservations`).
- **Relacionado:** [diccionario de objetos](../.docs/3B_diccionario_de_objetos.md)
  (local, §catalog `service_details`), [data-model §catalog](architecture/data-model.md),
  entrada de catalog 2d (variantes, mismo patrón de RLS por ítem padre).

## 2026-11-01 · `26ab5c7` · feat — M2 página de detalle de ítem + imágenes + editor de variantes

- **Qué:** página web `/mi-tienda/[id]/items/[itemId]` que reúne **imágenes del
  ítem** (subida directa en dos fases reusando `media` con `owner_type='item'`),
  **editor de variantes** (alta/baja con ejes desde los atributos `variant_axis`) y
  los atributos del ítem. Cierra la "web diferida" de media (núcleo) y de variantes
  (2d). Cada ítem del catálogo enlaza a su detalle.
- **Por qué:** era el eslabón que faltaba para operar un ítem completo desde la UI
  (fotos + SKUs), y da la base de página de detalle para lo que viene.
- **Impacto / archivos:** `packages/contracts/src/media.ts` (`MediaOwnerType` suma
  `item`); `packages/core/src/modules/media/http/routes.ts` (la autorización por
  entidad ahora es **inyectada**, `AuthorizeOwner`, para no acoplar media→store/
  catalog); `packages/core/src/modules/catalog` (`getItemStore`);
  `apps/api/src/index.ts` (implementa `authorizeOwner`: store→canManageStore,
  user→self, item→canManageCatalog de la tienda del ítem; **CORS** en `/media-local`
  para el PUT cross-origin del browser); `apps/web` (`lib/catalog` getItemMedia/
  getItemVariants, componentes `item-media`/`item-variants`, página de detalle,
  enlace desde el catálogo).
- **Decisiones de diseño:**
  - **Imágenes = `media` con `owner_type='item'`** (sin tabla `item_media` por
    ahora): se reusa todo el flujo de media (crear→PUT firmado→confirmar→listar).
    Orden por `created_at`; galería ordenada / imagen principal (`item_media`
    PROPUESTO) quedan para después.
  - **Autorización de media inyectada** (`AuthorizeOwner`): el módulo `media`
    (transversal) no debe depender de `store`/`catalog`; `apps/api` (que conoce
    todos los módulos) resuelve el permiso por `ownerType`. Para `item` resuelve la
    tienda del ítem (`getItemStore`) y exige `canManageCatalog`.
  - **CORS en `/media-local`:** el browser (web :3000) sube directo al storage de la
    API (:8787); se habilita CORS (origin = `WEB_URL`, métodos GET/PUT/OPTIONS) solo
    para esas rutas. El resto sigue por el proxy same-origin de Next.
  - **Diseño visual diferido** por indicación del usuario: se crean los objetos
    funcionales aunque la UI luzca tosca; habrá un skill de diseño de UI aparte.
- **Verificación:** `pnpm check` verde (boundaries 261); integración db 6/6 +
  core 40/40 (sin cambios de repo); smoke HTTP 7/7 (subida de imagen de ítem de
  punta a punta + gating `item` 403 a un no-manager).
- **Estado para retomar:** seguir con el mapa de `.docs`: `service_details`,
  `store_hours`, `collections`; **KYC**; **M3 inventario** (`stock_levels`,
  `stock_movements`, `reservations`); **M4 descubrimiento**; **M5 pedidos/pagos**.
- **Relacionado:** [diccionario de objetos](../.docs/3B_diccionario_de_objetos.md)
  (local), [data-model](architecture/data-model.md), entradas de media y catalog.

## 2026-11-01 · `017481b` · feat — M2 catalog rebanada 2d: variantes de ítem

- **Qué:** **variantes** de ítem (`catalog.item_variants`): combinaciones de ejes
  (color/talle…) con SKU único por ítem, barcode, precio opcional y `track_stock`
  (para inventario M3). CRUD anidado `GET/POST
  /v1/stores/{id}/items/{itemId}/variants` y `PATCH/DELETE .../{variantId}`. Los
  **ejes se validan** contra los atributos con `variant_axis` resueltos para la
  categoría del ítem. Seed: el taladro trae 2 variantes (color negro/azul).
- **Por qué:** completa el núcleo de catalog (ítems con variantes vendibles); el
  SKU/variante es la unidad que inventario (M3) y pedidos (M5) referencian.
- **Impacto / archivos:** `packages/contracts/src/catalog.ts` (`Sku`/`ItemVariant`
  (`+List`)/`CreateVariantInput`/`UpdateVariantInput`); migración
  `0012_romantic_slyde.sql` (`item_variants` + **RLS derivada del ítem padre** +
  grants); `packages/db/src/seed.ts` (2 variantes);
  `packages/core/src/modules/catalog/infra/variant-repo.ts` + router (4 rutas) +
  exports; `packages/core/test/integration/variant.test.ts`.
- **Decisiones de diseño:**
  - **RLS derivada del ítem (sin denormalizar):** las políticas usan una subconsulta
    `EXISTS (SELECT 1 FROM catalog.items i WHERE i.id = item_id …)`. Como esa
    subconsulta queda sujeta a la RLS de `items`, una variante **se ve si su ítem se
    ve**; y se gestiona si sos owner/admin/catalog de la tienda del ítem. Evita una
    columna/trigger de `store_id` en variantes.
  - **Validación de ejes:** se resuelven los atributos con `variant_axis` de la
    categoría del ítem y se valida `axis_values` con la misma función pura de 2c
    (clave no-eje o valor fuera de opciones → 400).
  - **Web diferida:** el editor de variantes necesita una página de **detalle de
    ítem** (todavía no existe); por eso 2d es backend + seed (como el núcleo de
    media). La lista de la tienda aún no muestra variantes.
  - `price_amount` de variante **opcional** (null = hereda el del ítem);
    `track_stock` es una bandera que consumirá inventario en M3.
- **Verificación:** `pnpm check` verde (boundaries 257); integración db 6/6 +
  **core 40/40** (+2 variantes: RLS por ítem padre, crear/editar/borrar, sales
  bloqueado); smoke HTTP 9/9 (ejes válidos/ inválidos, SKU repetido 409, gating).
- **Estado para retomar:** catalog núcleo **completo**. Siguiente: **imágenes de
  ítems** (wirear media; requiere una página de detalle de ítem que además dará
  lugar al editor de variantes), o **KYC**, o **M3/M4**.
- **Relacionado:** [data-model §catalog](architecture/data-model.md), entradas de
  catalog 2a/2b/2c.

## 2026-11-01 · `06fc93b` · feat — M2 catalog rebanada 2c: valores de atributo en ítems

- **Qué:** los ítems guardan **valores de atributo** (`items.attributes` jsonb) y
  el servidor los **valida contra las definiciones resueltas** (global+categoría+
  tienda) al crear/editar. Web: el formulario de alta pide los atributos aplicables
  según la categoría elegida (campos tipados: texto/número/opciones/sí-no) y la
  lista muestra los valores de cada ítem.
- **Por qué:** cierra el circuito de catalog (categoría → atributos → valores) y
  deja los ítems descritos con datos tipados; base para filtros (M4).
- **Impacto / archivos:** `packages/contracts/src/catalog.ts` (`AttributeValues`;
  `Item.attributes` + en create/update); migración
  `0011_early_the_captain.sql` (`items.attributes` jsonb, sin RLS propia: hereda la
  de items); `packages/core/src/modules/catalog/domain/validate-attributes.ts`
  (validación pura) + su unit test; `item-repo` (guarda/lee attributes);
  `http/routes.ts` (resuelve defs + valida en alta/edición, 400 si falla);
  `apps/web/_components/store-catalog.tsx` (campos dinámicos por categoría + fetch
  de resueltos; muestra valores); `test/integration/catalog.test.ts` (+1 round-trip).
- **Decisiones de diseño:**
  - **Validación en el handler (no en la RLS):** se resuelven las definiciones
    (`resolveAttributes`) para la categoría efectiva (la nueva o la actual del ítem)
    y se valida la forma/tipo con una función **pura** (`validate-attributes`, capa
    `domain`, testeable sin DB). Clave desconocida / tipo incorrecto / enum fuera de
    opciones → **400**. No hay "requerido" (las definiciones no lo modelan aún).
  - **`attributes` reemplaza** (no hace merge) cuando se envía en una edición.
  - El valor viaja tipado (`string|number|boolean`) y se guarda en jsonb; la web
    coacciona el número y el checkbox al armar el payload.
- **Verificación:** `pnpm check` verde (boundaries 255, +unit 4/4 de validación);
  integración db 6/6 + **core 38/38** (+1 round-trip jsonb); smoke HTTP 5/5
  (válido 201 + round-trip, tipo inválido 400, clave desconocida 400).
- **Estado para retomar:** **2d — variantes** (`item_variants`: sku, axis_values
  desde los atributos con `variant_axis`, precio/stock opcional). Luego imágenes de
  ítems (media) y KYC.
- **Relacionado:** [data-model §catalog](architecture/data-model.md), entradas de
  catalog 2a/2b.

## 2026-10-31 · `0d4403e` · feat — M2 catalog rebanada 2b: atributos (definiciones + herencia)

- **Qué:** sistema de **definiciones de atributo** con alcance (D-02) y su
  **resolución por herencia**. Tabla `catalog.attribute_definitions`
  (scope global|category|store, scope_id polimórfico, key/label/data_type/options/
  unit/filterable/variant_axis). Endpoints: `POST /v1/attributes` (global/categoría,
  admin de plataforma); `GET/POST /v1/stores/{id}/attributes` y
  `DELETE .../{attrId}` (alcance tienda, owner/admin/catalog);
  `GET /v1/stores/{id}/attributes/resolved?categoryId=` (conjunto heredado).
  Web: sección **Atributos** en `/mi-tienda/[id]` (definiciones propias + preview
  de los resueltos). Seed con atributos en los 3 alcances.
- **Por qué:** permite describir ítems con campos tipados y heredables, base para
  la validación de valores (2c) y los filtros de descubrimiento (M4).
- **Impacto / archivos:** `packages/contracts/src/catalog.ts` (`AttributeScope`/
  `AttributeDataType`/`AttributeKey`/`AttributeDefinition(+List)`/
  `CreateStoreAttributeInput`/`CreateGlobalAttributeInput`);
  `packages/db/src/schema/catalog.ts` (`attributeDefinitions`) + migración
  `0010_familiar_annihilus.sql` (tabla + índice único parcial global + **RLS
  polimórfica + grants**); `packages/db/src/seed.ts` (atributos de ejemplo);
  `packages/core/src/modules/catalog/infra/attribute-repo.ts` (CRUD + resolución
  con CTE recursiva) + router (5 rutas) + exports; `apps/web`
  (`lib/catalog` getStoreAttributes/getResolvedAttributes, `store-attributes.tsx`,
  página de detalle); `packages/core/test/integration/attribute.test.ts`.
- **Decisiones de diseño:**
  - **RLS polimórfica por `scope`:** lectura de global/categoría **pública**; las de
    tienda solo las ven sus miembros. Escritura: global/categoría = admin de
    plataforma; tienda = owner/admin/catalog. Todo en una política por operación con
    ramas por `scope` (usa `is_store_member(scope_id, …)` cuando `scope='store'`).
  - **Herencia (`resolveAttributes`):** globales + los de la categoría y **sus
    ancestros** (CTE recursiva sobre `parent_id`) + los de la tienda; si una `key`
    se repite gana el alcance más específico (tienda > categoría > global). Precedencia
    por profundidad de categoría queda simplificada.
  - **Unicidad de clave global:** el `UNIQUE(scope, scope_id, key)` no cubre los
    globales (en Postgres `NULL` scope_id se trata como distinto), así que un
    **índice único parcial** `(key) WHERE scope='global'` evita duplicar claves
    globales (lo detectó el smoke: creaba `marca` dos veces). Las de categoría/tienda
    sí quedan cubiertas por el UNIQUE compuesto (scope_id no nulo).
  - Los **valores** de atributo en cada ítem (con validación Zod contra las
    definiciones resueltas) y las **variantes** quedan para 2c.
- **Verificación:** `pnpm check` verde (boundaries 224 módulos); integración db 6/6
  + **core 37/37** (+4 attribute: herencia con/ sin categoría, alta por tienda vs
  sales, global solo admin, no-miembro no ve los de la tienda); smoke HTTP 10/10
  (resolución, gating 403, clave global duplicada 409).
- **Estado para retomar:** **2c** — `items.attributes` jsonb + validación de valores
  contra `resolveAttributes` + UI de campos dinámicos en el ítem; luego variantes
  (`item_variants`, ejes desde `variant_axis`). Después, imágenes de ítems (media).
- **Relacionado:** [data-model §catalog y §7](architecture/data-model.md), ADR-002
  (D-02), entradas de catalog 1 y 2a.

## 2026-10-31 · `194a70b` · feat — M2 catalog rebanada 2a: categorías (taxonomía)

- **Qué:** taxonomía **global** de categorías (jerárquica) + asignación de
  categoría a los ítems. Endpoints `GET /v1/categories` (pública) y
  `POST /v1/categories` (solo admin de plataforma). Los ítems ganan `category_id`
  (opcional): el alta/edición lo acepta y la web muestra un selector + la categoría
  en cada ítem. Seed con una taxonomía (Herramientas→Taladros, Belleza→Peluquería)
  y los ítems de ejemplo ya categorizados.
- **Por qué:** da estructura al catálogo y es la base para la herencia de atributos
  (2b) y para los filtros de descubrimiento (M4).
- **Impacto / archivos:** `packages/contracts/src/catalog.ts`
  (`CategoryKind`/`Category(+List)`/`CategorySlug`/`CreateCategoryInput`;
  `Item.categoryId` + en los inputs); `packages/db/src/schema/catalog.ts`
  (`categories` + `items.categoryId`) + migración `0009_charming_captain_cross.sql`
  (tabla + FK de jerarquía + FK items.category_id + **RLS + grants**);
  `packages/db/src/seed.ts` (taxonomía + ítems categorizados);
  `packages/core/src/modules/catalog/infra/category-repo.ts` + router (2 rutas) +
  `item-repo` (maneja `categoryId`); `apps/web` (`lib/catalog.ts`,
  `store-catalog.tsx` con selector, página de detalle);
  `packages/core/test/integration/category.test.ts`.
- **Decisiones de diseño:**
  - **Categorías = taxonomía de plataforma** (sin store/comunidad): RLS de lectura
    **pública** (`USING (true)` para cualquier sesión) y escritura solo admin de
    plataforma. Jerarquía por `parent_id` con FK self (RESTRICT).
  - **`path` ltree diferido:** su único uso es resolver ancestros (para la herencia
    de atributos de 2b); se hará con **CTE recursiva sobre `parent_id`**, más simple
    y sin las restricciones de labels/mantenimiento de ltree. Es una optimización de
    lectura que se puede agregar después si el volumen lo pide (desvía de D de
    ADR-002 a nivel implementación, no de modelo lógico).
  - **`items.category_id`** nullable con `ON DELETE SET NULL` (borrar una categoría
    no bloquea; los ítems quedan sin categoría). Validar que el `kind` de la
    categoría matchee el del ítem queda pendiente.
- **Verificación:** `pnpm check` verde (boundaries 221 módulos); integración db 6/6
  + **core 33/33** (+4 category: taxonomía visible a cualquiera, alta solo admin,
  no-admin bloqueado por RLS, asignar categoría a un ítem); smoke HTTP 8/8
  (jerarquía, gating admin 403, slug dup 409, ítem con categoría).
- **Estado para retomar:** **2b — atributos**: `attribute_definitions`
  (scope global/category/store, D-02) + resolución por herencia (global +
  ancestros de la categoría + tienda) + validación de los valores en `items`. Luego
  variantes e imágenes de ítems.
- **Relacionado:** [data-model §catalog y §7](architecture/data-model.md), ADR-002
  (D-05), entrada de catalog rebanada 1.

## 2026-10-31 · `e97e577` · feat — M2 catalog rebanada 1: ítems de tienda

- **Qué:** módulo `catalog` con su primera rebanada: **ítems** (producto o
  servicio) de una tienda. Tabla `catalog.items` + CRUD anidado
  `GET/POST /v1/stores/{id}/items` y `PATCH/DELETE .../items/{itemId}`. Cara web:
  sección **Catálogo** en `/mi-tienda/[id]` (listado + alta por tipo/precio +
  publicar/despublicar + borrar). Seed con 3 ítems de ejemplo. Categorías,
  atributos, variantes, colecciones y búsqueda llegan en rebanadas siguientes.
- **Por qué:** es el corazón de M2 — convierte una tienda vacía en una con
  productos; además estrena el rol de tienda **`catalog`** y el patrón de
  denormalización de `community_id` (D-05).
- **Impacto / archivos:** `packages/contracts/src/catalog.ts`
  (`ItemKind`/`ItemStatus`/`PriceMode`/`Item(+List)`/`CreateItemInput`/
  `UpdateItemInput`/`MoneyAmount`/`Currency`); `packages/db/src/schema/catalog.ts`
  (`items`) + migración `0008_futuristic_amphibian.sql` (schema `catalog` + tabla
  **+ trigger de community_id + RLS + grants**); `packages/db/src/seed.ts` (3
  ítems) y `packages/db/src/reset.ts` (dropea también `catalog` y `media`);
  `packages/core/src/modules/catalog/**` (item-repo + router) + `exports`;
  `packages/core/src/http/authz.ts` (`canManageCatalog`); `apps/api` (monta
  `catalogRouter`); `apps/web` (`getStoreItems`, `store-catalog.tsx`, página de
  detalle); `packages/core/test/integration/catalog.test.ts`.
- **Decisiones de diseño:**
  - **`community_id` denormalizado por trigger BEFORE INSERT** (D-05,
    `SECURITY DEFINER`): se fija desde la tienda, el cliente no lo envía ni puede
    falsearlo. BEFORE para que exista antes del NOT NULL / WITH CHECK.
  - **RLS de dos niveles:** los miembros de la tienda ven todo (incluye
    borradores); afuera, solo ítems **publicados** en comunidad visible
    (`can_see_community`). Gestionar (insert/update/delete) = owner/admin/**catalog**
    (estrena el rol). La visibilidad de compradores se apoya en esta misma política.
  - **Rutas anidadas bajo `/stores/{id}/items` pero en el módulo `catalog`**
    (dueño de la tabla): la URL refleja la pertenencia sin romper los límites de
    módulos (el router de catalog se monta en `/v1`).
  - **Dinero**: `numeric(12,2)` + moneda explícita; en el DTO viaja como string.
    `published_at` se congela al publicar por primera vez.
  - **Insert vía SQL crudo** (omite `community_id`, lo pone el trigger); update
    con el builder usando `Date` de JS (sin SQL en el `set`, para no pelear con los
    tipos de Drizzle).
  - **Fix `reset.ts`:** no dropeaba los esquemas nuevos `media`/`catalog`, así que
    el 2º `db:reset` chocaba con `CREATE SCHEMA ... already exists`. Ahora dropea
    la lista completa (al agregar un `pgSchema` hay que sumarlo acá).
- **Verificación:** `pnpm check` verde (boundaries 218 módulos); integración db
  6/6 + **core 29/29** (+5 catalog: trigger de community, publicar fija
  published_at, RLS que bloquea a `sales`, no-miembro ve solo publicados, borrar);
  smoke HTTP 12/12 (owner ve 2 / no-miembro 1, gating 403, slug repetido 409).
- **Estado para retomar:** siguientes rebanadas de catalog: **categorías**
  (ltree) y **atributos** (con herencia global→categoría→tienda), **variantes**,
  y la **búsqueda** (M4). Luego wirear **imágenes** (media) a ítems. Pendiente:
  validación de `attributes` jsonb y `search_tsv`.
- **Relacionado:** [data-model §catalog y §7](architecture/data-model.md),
  ADR-002 (D-02, D-05), ADR-001, entradas de store 1–3 y media.

## 2026-10-31 · `d2e9249` · feat — M2 media (núcleo): subida con URL firmada + storage local

- **Qué:** módulo transversal `media`. Tabla `media.media` (polimórfica por
  `owner_type`/`owner_id`) + subida en **dos fases**: `POST /v1/media` crea la fila
  `pending` y devuelve una **URL de subida firmada**; el cliente sube el archivo
  directo al storage; `POST /v1/media/{id}/complete` la marca `ready`. También
  `GET /v1/media?ownerType=&ownerId=` y `DELETE /v1/media/{id}`. Storage de **dev
  local** (disco + token HMAC) con las rutas `PUT /media-local/upload/:token` y
  `GET /media-local/file/:key`, montadas **fuera de `/v1`**. Sin cara web todavía
  (núcleo backend; el primer consumidor —logo de tienda— es la próxima rebanada).
- **Por qué:** pieza transversal de M2 que desbloquea imágenes de ítems/tiendas y
  el documento de KYC. Se eligió antes que catalog/KYC por ser el cuello de botella
  común.
- **Impacto / archivos:** `packages/contracts/src/media.ts`
  (`MediaOwnerType`/`MediaStatus`/`MediaMime`/`Media(+List)`/`CreateMediaInput`/
  `UploadTarget`/`CreateMediaResponse`); `packages/db/src/schema/media.ts`
  (`mediaFiles`) + migración `0007_fresh_franklin_richards.sql` (schema `media` +
  tabla **+ RLS + grants anexados**); `packages/core/src/modules/media/**`
  (`storage.ts` interfaz + helpers MIME↔ext, `infra/media-repo.ts` SQL crudo,
  `http/routes.ts` router, `index.ts`) + `exports` de `@3b/core`;
  `apps/api/src/local-media.ts` (storage local + router de disco) y wiring en
  `apps/api/src/index.ts`; `packages/config/src/env.ts`
  (`MEDIA_LOCAL_DIR`/`MEDIA_SIGN_SECRET`/`MEDIA_PUBLIC_URL`); `.gitignore`
  (`.media-uploads/`); `packages/core/test/integration/media.test.ts`.
- **Decisiones de diseño:**
  - **Subida directa firmada (dos fases)** espejando R2: el archivo no pasa por la
    capa de dominio. En dev, la "firma" es un token HMAC `{key, mime, exp}` que
    valida la ruta local; en prod se reemplaza por un presigned PUT de R2.
  - **`MediaStorage` como interfaz en core, implementación inyectada desde
    `apps/api`** (igual que `paymentsEncKey`): core no toca `fs`/`crypto`/nube.
  - **RLS por `created_by`** (quien sube gestiona su media); la autorización por
    entidad dueña (`canManageStore` para `store`, o `ownerId == usuario` para
    `user`) la agrega el handler. El **archivo** se sirve por su URL de storage,
    no por la tabla. _Limitación conocida_: el listado por owner solo muestra la
    media propia; la visibilidad para todo el equipo/compradores es una política
    posterior por consumidor.
  - **La `key` la genera la base** (`owner/owner_id/uuid.ext`) y `created_by` sale
    de `authz.current_user_id()`, nunca del cliente. Rutas de archivo **fuera de
    `/v1`** (sin sesión): la subida se autentica por el token; la lectura es pública
    (bucket de dev), con guardas anti-traversal.
  - **Procesamiento de imágenes diferido** (resize/variantes): necesita el worker
    (M3); `sizes` queda vacío.
- **Verificación:** `pnpm check` verde (boundaries 202 módulos); integración db 6/6
  + **core 24/24** (+3 de media: crear pending→ready con key generada, RLS que
  oculta la media de otro usuario, borrar); smoke HTTP 14/14 (dos fases completas:
  crear→PUT firmado→servir con bytes round-trip→confirmar→listar→borrar + token
  inválido + gating 403).
- **Estado para retomar:** próximo: **consumidor de media** (logo de tienda →
  columna `stores.logo_media_id` + uploader web), o `catalog`, o **KYC** (ya puede
  usar media para el documento; falta el flujo de revisión por admin de comunidad).
  Pendientes de media: procesamiento (M3) y visibilidad owner-wide/compradores.
- **Relacionado:** [data-model §media y §7](architecture/data-model.md), ADR-001,
  entradas de store 1–3.

## 2026-10-31 · `05d5785` · feat — M2 store rebanada 3: métodos de pago (cifrados)

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
