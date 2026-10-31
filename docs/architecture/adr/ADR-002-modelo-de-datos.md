# ADR-002 — Modelo de datos del MVP

- **Estado**: **Aceptada** (aprobada por el arquitecto; abierta a revisión del
  equipo). Implementación por migraciones incrementales (§7 del modelo).
- **Fecha**: 2026-10-30.
- **Contexto**: antes de M2 se cierra la arquitectura de datos/objetos de 3B,
  usando el Playbook v1.0 como fuente funcional. El modelo completo (conceptual,
  lógico y físico) vive en [`../data-model.md`](../data-model.md); este ADR fija las
  **decisiones** que resuelven ambigüedades y guían las migraciones incrementales.

## Decisiones

- **D-00 Modelado base**: `uuid` PK, `timestamptz`, dinero `numeric(12,2)` + moneda
  explícita, geo PostGIS, un esquema Postgres por módulo, enums como `text` +
  validación Zod, **ledgers de solo inserción** (stock, pagos, auditoría, outbox) con
  proyección en la misma transacción.
- **D-01 `mover_profiles` → esquema `shipping`**: el Mover es una capacidad del
  dominio de envíos. Hoy está en `identity` (MVP temprano); se **reubica** en M6.
  `identity` conserva solo la identidad base.
- **D-02 Atributos con scope polimórfico**: `attribute_definitions(scope, scope_id)`
  sin FK dura; integridad por aplicación; índice `(scope, scope_id)`.
- **D-03 Comprobantes**: `payment_reports` con `order_id` **o** `statement_id`
  (ambas nullable) + `CHECK` de exactamente una. Evita FK polimórfica.
- **D-04 Reseñas cruzadas**: `reviews(subject_type ∈ {store,mover,maker}, subject_id)`
  - `unique(order_id, author_id, subject_type)`; sin FK dura al sujeto.
- **D-05 `community_id` denormalizado** en `items`/`orders`: se fija desde la tienda
  por trigger (una tienda vive en una comunidad). Mejora RLS y descubrimiento.
- **D-06 Geo con PostGIS**: `geography(Point,4326)` (center, address, store,
  shipment, pings) y `geography(Polygon,4326)` (boundary, service_area). `point`
  con tipo custom de Drizzle; `polygon` por SQL crudo. Entra en M4 y M6.
- **D-07 UUID v7**: agregar función `uuidv7()` y usarla como default en tablas de
  alto volumen (movimientos, pings, mensajes, eventos); `gen_random_uuid()` (v4)
  aceptable para el resto.
- **D-08 Particionado por mes** de `location_pings` y `messages` vía SQL crudo en la
  migración; retención por job del worker (90 d pings).
- **D-09 Nombres de esquema = nombre del módulo**: `orders`, `payments` (plural y
  consistente), **no** `commerce`/`payment`. Corrige la mezcla del Playbook.
- **D-10 Moneda a nivel pedido**: `orders.currency` + `fx_rate_ves` congelado;
  precios de línea en esa moneda; conversión a Bs solo para mostrar.
- **D-11 `templates` ↔ atributos** vía tabla puente `template_attributes(template_id,
  attribute_id, position)` con FKs reales (en vez de un array de ids).
- **D-12 Fase 2 fuera del MVP**: `changesets`/MCP y `api_clients` no se modelan en el
  MVP; se incorporan al activar el MCP del Seller.

## Consecuencias

- Las migraciones se vuelven **incrementales por hito** (§7 del modelo), aditivas y
  cada una con su RLS; no se crean tablas de más por adelantado.
- Algunas decisiones (D-06 geo, D-07 v7, D-08 particiones) exigen **SQL crudo** en
  migraciones custom de Drizzle — aceptable y aislado.
- Las FK polimórficas se evitan (D-02/D-03/D-04) a costa de validación por
  aplicación/trigger, más simple de evolucionar.

## Alternativas consideradas

- **Crear todo el esquema de una vez**: descartado — contradice la entrega por
  rebanadas verticales y dificulta la revisión y el trabajo en paralelo.
- **Tablas separadas por tipo en vez de columnas polimórficas** (p. ej. reseñas de
  tienda/mover/maker): más FKs duras pero triplica superficie; se reevaluará si la
  validación por aplicación resulta frágil.
- **IDs v4 en todo**: más simple, pero pierde ordenamiento temporal útil en ledgers
  de alto volumen (D-07).

## Confirmaciones de revisión

- **D-07** — Confirmado: se adopta `uuidv7()` para tablas de alto volumen.
- **D-01** — Confirmado: `mover_profiles` se reubica a `shipping` en M6.
- **D-10** — Confirmado: moneda a nivel de **pedido** (sin moneda por línea en el MVP).

El resto de las decisiones (D-00, D-02…D-06, D-08, D-09, D-11, D-12) quedan
aprobadas con este ADR. Cambios futuros ⇒ nuevo ADR + actualización de
`data-model.md`.
