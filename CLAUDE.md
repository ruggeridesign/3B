# CLAUDE.md — 3B (monorepo)

Guía para Claude Code al trabajar en este repositorio.

## Qué es este proyecto

**3B** es un marketplace comunitario (Sellers / Makers / Movers). Este repo es un
**monorepo** (pnpm workspaces + Turborepo) con las apps y los paquetes de la
plataforma. El design system vive como un paquete más (`@3b/ui`).

- Repo: https://github.com/ruggeridesign/3B
- Apps: `@3b/web`, `@3b/api`, `@3b/worker` · Packages: `@3b/ui`, `@3b/core`,
  `@3b/db`, `@3b/contracts`, `@3b/api-client`, `@3b/auth`, `@3b/config`.

## Documentación viva (DDR) — OBLIGATORIO

Mantener el **DDR** (`docs/DDR.md`): historial cronológico inverso con **una
entrada por commit / feature / decisión**, con contexto suficiente para que
**cualquier IA o persona retome** el trabajo (qué, por qué, archivos, verificación,
cómo seguir). Reglas:

- **Cada vez que se cierra una unidad de trabajo que termina en commit**, agregar
  su entrada **arriba** en `docs/DDR.md` con el formato documentado ahí. Fechas
  **absolutas**. Enlazar archivos clave y el ADR si aplica.
- Decisiones **arquitectónicas** profundas van en un **ADR** nuevo
  (`docs/architecture/adr/`), y la entrada del DDR lo enlaza. El DDR es el diario;
  los ADR son el detalle con alternativas y consecuencias.
- Mantener al día el bloque **"Estado actual (para retomar rápido)"** del DDR.
- Al empezar una sesión: leer el DDR (y `docs/architecture/data-model.md`) para
  tomar contexto antes de tocar código.

## Stack y convenciones base

- **TypeScript estricto** de punta a punta · **pnpm workspaces** + **Turborepo**.
- **apps/web**: Next.js (App Router) + Tailwind v4 (`@tailwindcss/postcss`);
  consume `@3b/ui` y `@3b/api-client`.
- **apps/api**: Hono + `@hono/zod-openapi` (OpenAPI en `/openapi.json`, docs en
  `/docs`). Monta los routers http de los módulos de `@3b/core`.
- **apps/worker**: placeholder (BullMQ/outbox), no se ejecuta aún.
- **packages/core**: lógica de negocio por módulo (`domain` / `application` /
  `http` / `infra` + `index.ts` como API pública). **Toda la lógica vive acá.**
- **packages/contracts**: Zod (DTOs, enums, estados) — fuente única de verdad.
- **packages/db**: Drizzle ORM + PostgreSQL (un esquema por módulo).
- **packages/api-client**: cliente tipado que consume la API.
- **packages/auth**: Better Auth sobre `identity.users` (email + Google preparado).
  Usa la conexión **owner** (gestiona identidades; bypassa RLS).
- **packages/config**: tsconfig base, reglas de límites (dependency-cruiser) y
  validación de env.
- **packages/ui** (design system): React 19 + **Tailwind CSS v4** (tokens en
  `packages/ui/src/styles/theme.css`, CSS-first, sin `tailwind.config.js`) +
  **shadcn/ui** (`new-york`) + **Storybook**. Se consume **desde la fuente**
  (sin build), por eso sus imports internos son **relativos** (no alias `@/`).
- **Calidad**: Biome (lint+formato), Vitest, dependency-cruiser. Todo por `pnpm check`.

### Reglas de arquitectura (validadas con dependency-cruiser)

- Un módulo de `core` solo importa el `index.ts` público de otro módulo.
- `core/**/domain` es puro: sin Hono, Drizzle ni acceso a DB.
- `apps/web` **no** implementa lógica de negocio ni toca Postgres: habla con la
  API vía `@3b/api-client`.
- Toda entrada validada con `@3b/contracts`; dinero en `numeric` + moneda explícita.

## Autenticación y autorización (backbone)

- **Auth**: Better Auth (`@3b/auth`) con email (Google preparado, opcional); rutas
  en `/api/auth/**`. `sessions`/`accounts`/`verifications` viven en el esquema
  `identity`, mapeadas sobre `identity.users` (sin duplicar identidad).
- **Identidad**: una por usuario; **todo usuario es Maker**. Seller = membresías de
  tienda (`store.store_members`); Mover = `identity.mover_profiles` aprobado; admin
  de comunidad = `community.memberships.role='admin'`; admin de plataforma =
  `identity.users.is_platform_admin`. Son **capacidades con alcance**, no roles
  globales.
- **RLS + RBAC** (defensa en capas):
  - El runtime usa el rol `app` (mínimo privilegio, **sin BYPASSRLS**). El contexto
    se fija por transacción con `withAppContext` (`SET LOCAL app.user_id`, se limpia
    al cerrar). **Nunca** se confía en identificadores enviados por el cliente.
  - Las políticas RLS y las funciones `authz.*` (`SECURITY DEFINER`) derivan los
    permisos de la base. El middleware de apps/api resuelve sesión → contexto RLS →
    capacidades (`/v1/me`).
  - Las acciones administrativas sensibles se registran en `platform.audit_log`.
- **Tests**: `pnpm test:integration` corre aislamiento RLS (db) + capacidades RBAC
  (core) contra la DB real. Nunca editar una migración aplicada: generar una nueva.

## Comandos

```bash
pnpm install                      # instala el workspace
pnpm check                        # lint + typecheck + test + boundaries (debe quedar VERDE)
pnpm dev                          # turbo: web + api + ui en paralelo
pnpm --filter @3b/ui storybook    # catálogo del design system (puerto 6006)
pnpm --filter @3b/web dev         # Next.js (puerto 3000)
pnpm --filter @3b/api dev         # Hono + OpenAPI/docs (puerto 8787)

# Base de datos (Docker Desktop instalado; Postgres en el puerto 5433):
pnpm db:up                        # Postgres 17 + PostGIS (docker compose)
pnpm db:migrate                   # aplica migraciones (Drizzle)
pnpm db:seed                      # datos semilla deterministas
pnpm db:reset                     # drop + migrate + seed (reinicio de desarrollo)
pnpm --filter @3b/db generate     # genera una migración nueva
pnpm test:integration             # reset + tests de integración (RLS + RBAC); requiere DB
```

Después de cualquier cambio, correr `pnpm check`. El 5432 lo ocupa un Postgres
nativo de la máquina de dev, por eso el contenedor publica en **5433**.

## Estructura

```
apps/
├── web/            # Next.js (App Router) — consume @3b/ui y @3b/api-client
├── api/            # Hono — monta los routers http de @3b/core
└── worker/         # placeholder (no se ejecuta aún)
packages/
├── ui/             # Design system (shadcn/ui + tokens + Storybook)
│   └── src/
│       ├── components/ui/   # componentes + *.stories.tsx (co-locadas)
│       ├── lib/utils.ts     # cn() — merge de clases de Tailwind
│       ├── styles/theme.css # design tokens (:root / .dark / @theme inline)
│       └── index.ts         # API pública del DS
├── core/           # dominio por módulo (domain/application/http/infra)
├── contracts/      # Zod (DTOs, enums, estados)
├── db/             # Drizzle (esquema por módulo)
├── api-client/     # cliente tipado de la API
└── config/         # tsconfig base, dependency-cruiser, env
```

## Cómo agregar un componente de shadcn/ui (en packages/ui)

1. Instalarlo con el CLI (desde el paquete `@3b/ui`):

   ```bash
   pnpm --filter @3b/ui exec shadcn@latest add <nombre>   # ej: dialog, select, badge
   ```

   Se crea en `packages/ui/src/components/ui/<nombre>.tsx`.

2. **IMPORTANTE — revisar los imports después de agregar:**
   - El CLI genera imports con alias `@/` (ej. `import { cn } from "@/lib/utils"`).
     Como el DS se consume **desde la fuente**, **convertir los `@/` a imports
     relativos** (ej. `../../lib/utils`, `./button`). Si no, `apps/web` no typechea.
   - Bug conocido del CLI: a veces genera `from "cn"` e instala un paquete espurio
     `cn` → corregir el import y `pnpm --filter @3b/ui remove cn` si aparece.
   - Los imports de `radix-ui` (paquete unificado) **sí** son correctos.

3. Exportar el componente en `packages/ui/src/index.ts`:

   ```ts
   export * from './components/ui/<nombre>';
   ```

4. Crear su story `packages/ui/src/components/ui/<nombre>.stories.tsx` (ver
   `button.stories.tsx`).

5. Correr `pnpm check`.

## Cómo personalizar / crear componentes propios

Los componentes de `packages/ui/src/components/ui/` son **tuyos**: editalos para
ajustar estilos, variantes y comportamiento a 3B. Para componentes nuevos desde
cero, seguí el mismo patrón (named exports, `cn()` para clases, props tipadas,
`React.ComponentProps<...>`, **imports relativos**), co-locá su `.stories.tsx` y
exportá desde `packages/ui/src/index.ts`.

### Plantilla de story

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MiComponente } from './mi-componente';

const meta = {
  title: 'UI/MiComponente',
  component: MiComponente,
  tags: ['autodocs'],
} satisfies Meta<typeof MiComponente>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
```

## Design tokens

- Definir colores, radios, motion y tipografía en `packages/ui/src/styles/theme.css`, en los
  bloques `:root` (claro) y `.dark` (oscuro). Preferir color en **oklch**.
- El mapeo a utilidades de Tailwind vive en `@theme inline`
  (ej: `--color-primary: var(--primary)` habilita `bg-primary`, `text-primary`).
- La paleta de marca (Playbook v1.0) ya está aplicada. Para re-tematizar, editar los
  valores crudos en `:root` / `.dark`; los componentes consumen los tokens, así que
  cambiarlos re-tematiza todo el sistema.
- No hardcodear colores/espaciados/radios/tiempos en componentes si existe un token.

## Dirección de diseño de 3B

Reglas transversales que todo componente debe respetar. Fuente: Playbook v1.0 +
lineamientos del equipo.

### Color por rol

La paleta tiene **significado semántico**. Usar siempre el token, nunca el hex:

| Token           | Color     | Rol / uso                                  |
| --------------- | --------- | ------------------------------------------ |
| `--primary`     | verde     | **Movers** · acción principal              |
| `--accent`      | ámbar     | **Sellers** · insignias, foco, estrellas   |
| `--brand`       | terracota | **Makers** · precios en oferta, destacados |
| `--destructive` | terracota | acciones destructivas y alertas            |
| `--background`  | crema     | fondo general                              |
| `--foreground`  | marrón    | texto y encabezados                        |
- `--primary` es el **verde british** (acción principal; es también el color del rol
  Movers).
- El **naranja terracota** es el color de marca transversal: `--brand` /
  `--destructive` y destacados.
- `--accent` (ámbar) **nunca** como color de texto sobre crema (bajo contraste).
- Alias por rol: `bg-mover` / `bg-seller` / `bg-maker` (→ primary / accent / brand).
- **Campos de formulario** (input y el _trigger_ cerrado de select) usan `--field`
  (`bg-field`): blanco en claro, superficie sólida en oscuro, para que lo escrito se
  lea bien incluso sobre una superficie `.glass`. El dropdown abierto del select sí
  es `.glass`.

### Radio

- Estándar **6px** (`rounded-md`); máximo **8px** (`rounded-lg`). `rounded-xl` está
  capado a 8px.
- **Prohibido** `rounded-full` / formas totalmente redondeadas. Única excepción a
  confirmar caso por caso: afordancias inherentemente circulares (radio buttons,
  avatares, switch) al construir cada componente.

### Glassmorfismo (vidrio esmerilado)

Toda superficie con **elevación** sobre otra usa vidrio esmerilado estilo "liquid
glass" de Apple / Fluent de Microsoft. No usar un `bg-*` sólido en ellas.

- `.glass` → elementos emergentes: modales, sidesheets, popovers, dropdowns, selects
  abiertos, tooltips (lleva sombra flotante).
- `.glass-bar` → barras persistentes: navbar y sidebar (más opaca, blur más fuerte,
  sin sombra flotante).
- Se componen con utilidades de Tailwind para radio/padding
  (ej: `<div className="glass rounded-lg p-4">`). Hay fallback sólido automático si
  el navegador no soporta `backdrop-filter`.

### Motion

- **Ningún cambio de estado es instantáneo.** Abrir/cerrar un colapsable, dropdown,
  modal, etc. siempre va con transición fluida que le da vida a la app.
- Usar los tokens: easings `ease-standard` / `ease-emphasized` / `ease-exit` y
  duraciones `var(--duration-fast|base|slow)`. `tw-animate-css` está disponible.
- Se respeta `prefers-reduced-motion` globalmente (ya configurado en `theme.css`).
- El sistema de motion design propio llegará más adelante.

### Estados y feedback

- Estados claros y accesibles: hover, focus-visible (anillo ámbar), active, disabled,
  loading, error y vacío.
- **Sin spinners genéricos.** La comunicación de carga/estado se construirá con el
  sistema de motion design propio; mientras tanto, no introducir un spinner por
  defecto.

## Reglas de calidad

- Componentes **accesibles**: HTML semántico, roles/aria cuando corresponda,
  foco visible. El addon de a11y de Storybook ayuda a detectar problemas.
- No introducir dependencias nuevas sin necesidad.
- Mantener `src/index.ts` como única API pública del paquete.
- Idioma: comentarios y documentación en español; nombres de código en inglés.
