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
  **M2** (tienda+catálogo+media; ver abajo).
- **En curso:** **M3 · Inventario** (r1 hecha) y **M4 · Descubrimiento** (**completo**
  salvo el proyección de ranking con señales de comportamiento), por rebanadas.
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
  - **M4 cerrado** (salvo esa proyección). Siguiente: **M5 pedidos** (carrito/checkout;
    trae las **reservas** de stock y enciende worker+Valkey).
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
  `pnpm --filter @3b/web dev` (3000). Usuarios seed, password `Password123!`
  (carlos@3b.test = Seller con 2 tiendas e ítems; admin@3b.test = superadmin +
  "Ver como"). **Ojo:** `pnpm test:integration` resetea la DB (desloguea); re-seed
  con `pnpm db:reset` para el demo.
- **Entorno:** DB en Docker, puerto **5433** (el 5432 es un Postgres nativo).
  `pnpm check` debe quedar verde; `pnpm test:integration` corre RLS/RBAC contra
  DB real. CI en GitHub Actions valida ambos en cada push/PR a `main`.
- **Git:** commits **directos a `main`** (dev extra: Raphaelofwar). Un commit por
  unidad lógica; cada uno con su entrada en este DDR.

---

## 2026-11-01 · _(este commit)_ · feat — M4 rebanada 5: cercanía (vecinas) + orden local-first

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
