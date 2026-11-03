# Onboarding — 3B (para colaboradores)

Guía para clonar el código, levantar un **localhost** y ponerse al día con el
proyecto. (Doc temporal de handoff; se puede borrar cuando ya no haga falta.)

---

## 0) Prerrequisitos (instalar una vez)

| Herramienta | Versión | Notas |
| --- | --- | --- |
| **Git** | cualquiera reciente | para clonar |
| **Node.js** | **≥ 20** (LTS 20 o 22) | el repo exige `>=20` |
| **pnpm** | **11.6.0** | gestor del monorepo |
| **Docker Desktop** | reciente (WSL2 en Windows) | corre la base y Valkey |

Instalar **pnpm** con corepack (viene con Node):

```bash
corepack enable
corepack prepare pnpm@11.6.0 --activate
```

- Tener **Docker Desktop corriendo** antes de los pasos de base de datos.
- **Acceso al repo** (`https://github.com/ruggeridesign/3B`): pedile al dueño
  (ruggeridesign) que te **invite como colaborador** en GitHub (Settings →
  Collaborators). Sin eso no podés clonar/pushear (el repo es privado).

## 1) Clonar

```bash
git clone https://github.com/ruggeridesign/3B.git
cd 3B
```

## 2) Instalar dependencias

```bash
pnpm install
```

## 3) Variables de entorno

Copiá el ejemplo a `.env` (trae los valores de desarrollo; no hace falta tocar nada):

```bash
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

> `.env` está en `.gitignore` (no se sube). Los secrets de dev son de juguete; en
> producción se cambian.

## 4) Base de datos (Docker)

Con Docker Desktop abierto:

```bash
pnpm db:up        # Postgres 17 + PostGIS (puerto 5433) y Valkey (puerto 6380)
pnpm db:reset     # migraciones + datos de ejemplo (seed) + usuarios
```

> **Puertos**: Postgres va en **5433** (no 5432) y Valkey en **6380** (no 6379),
> para no chocar con instalaciones nativas.

## 5) Levantar el localhost

En **dos terminales** (dentro de `3B`):

```bash
# Terminal 1 — API (Hono)
pnpm --filter @3b/api dev        # → http://localhost:8787  (docs en /docs)

# Terminal 2 — Web (Next.js)
pnpm --filter @3b/web dev        # → http://localhost:3000
```

Opcional (para probar el **vencimiento de reservas** y el **rastreo en vivo**):

```bash
# Terminal 3 — Worker
pnpm --filter @3b/worker dev
```

Abrí **http://localhost:3000**.

## 6) Usuarios de prueba (contraseña `Password123!`)

| Email | Rol / para qué sirve |
| --- | --- |
| `admin@3b.test` | Admin de plataforma (+ "Ver como") |
| `carlos@3b.test` | **Seller** — dueño de 2 tiendas con ítems |
| `ana@3b.test` | Admin de la comunidad Coro |
| `marta@3b.test` | Vendedora (miembro de tienda) |
| `pedro@3b.test` | **Mover** aprobado (repartidor) |
| `lucia@3b.test` | **Maker** (comprador) |

Para ver un envío end-to-end, usá sesiones distintas: `lucia` compra, `carlos`
acepta/prepara, `pedro` reparte.

## 7) Comandos útiles

```bash
pnpm check              # lint + typecheck + tests + boundaries (TODO debe quedar verde)
pnpm db:reset           # reinicia la base a datos limpios de ejemplo
pnpm test:integration   # tests de RLS/RBAC contra la DB real (OJO: resetea la base)
pnpm --filter @3b/ui storybook   # design system (puerto 6006)
```

## 8) Convenciones para trabajar

- Commits **directo a `main`**, uno por unidad lógica.
- **Obligatorio**: al cerrar una unidad de trabajo, sumá tu entrada **arriba** en
  `docs/DDR.md` (el diario del proyecto) y corré `pnpm check` antes de pushear.
- Lecturas de arranque: **`CLAUDE.md`** (stack y reglas) y **`docs/DDR.md`**
  (historial + bloque "Estado actual para retomar rápido").

### Problemas comunes

- *No conecta a la base* → Docker no está corriendo, o apuntás a 5432 en vez de **5433**.
- *Después de `pnpm test:integration` no puedo loguear* → ese comando resetea la DB;
  corré `pnpm db:reset` para recargar el seed.

---

## Estado del proyecto (qué tenemos y por dónde vamos)

**3B** es un marketplace comunitario (Sellers / Makers / Movers), monorepo pnpm +
Turborepo, TypeScript estricto, Postgres/PostGIS con **RLS** + RBAC, y design system
propio (`@3b/ui`).

### Hecho y cerrado

- **Base**: monorepo, CI, Postgres/PostGIS + migraciones + seed, Better Auth + **RBAC
  con alcance** + **RLS** + auditoría.
- **M1** — Shell de la app, "Ver como" (impersonación), helpers de autorización.
- **M2** — **Tienda + Catálogo + media**: tiendas, equipo/roles, métodos de pago,
  horarios, KYC; ítems, categorías, atributos, variantes, servicios, colecciones;
  subida de imágenes.
- **M3** — **Inventario** (r1): existencias + libro de movimientos (no sobreventa),
  reservas.
- **M4** — **Descubrimiento**: feed por comunidad, búsqueda full-text, facetas, ficha
  de ítem/tienda, orden local-first (comunidad propia → vecinas).
- **M5** — **Pedido end-to-end (CERRADO)**: carrito/checkout → máquina de estados +
  reserva → **pago por comprobante** (con captura) → **chat** → **reseñas** →
  **preguntas** → **reportes**; + infra **worker + Valkey** (vencer reservas, outbox →
  `stock.changed`).
- **M6** — **Envíos y rastreo (CERRADO)**: solicitud de envío → ofertas de Movers →
  asignación + **PIN** → progreso del viaje → **entrega con PIN** (descuenta stock
  real) → **rastreo en vivo por WebSockets**.

### Por dónde vamos

- **Siguiente hito: M7 · Billing + panel de comunidad** — suscripciones, comisiones,
  estados de cuenta, panel del admin de comunidad (cola de verificaciones, métricas).
- Después: **M8 · PWA** (offline, instalable, push) y **M9 · Capa de diseño / MVP**.

### Pendientes menores anotados (no bloquean)

- De M6: vencer ofertas (S-1) y auto-cierre a 48 h como jobs del worker;
  cancelar/fallido con motivo; KYC de Movers; mapa real en la web (hoy se muestran
  lat/lng).
- De M4: proyección de **ranking** con señales de comportamiento (ya tiene insumos:
  pedidos + reseñas).

> El detalle fino (decisiones, archivos, cómo seguir) está en **`docs/DDR.md`**, en
> orden cronológico inverso. Es la mejor puerta de entrada para ponerse al día.
