# CLAUDE.md — 3B Design System

Guía para Claude Code al trabajar en este repositorio.

## Qué es este proyecto

Design system de **3B**, un sistema de gestión de negocios fácil de aplicar y
con MCPs. Este repo es una **librería de componentes de React** (no la app final):
define los design tokens y los componentes de UI que la aplicación de 3B consume.

- Repo: https://github.com/ruggeridesign/3B
- Paquete: `3b-design-system`

## Stack y convenciones base

- **React 19 + TypeScript** (modo `strict`).
- **Vite** en modo librería (`vite build` → `dist/`) + playground (`vite dev`).
- **Tailwind CSS v4**: los tokens se definen en `src/styles/theme.css` dentro de
  los bloques `:root` / `.dark` y se mapean a utilidades en `@theme inline`.
  **No** se usa `tailwind.config.js` (Tailwind v4 es CSS-first).
- **shadcn/ui** como base de componentes (estilo `new-york`, base color `neutral`).
  Los componentes se **copian** al repo (en `src/components/ui/`), así que se
  pueden editar y personalizar libremente para la identidad de 3B.
- **Storybook** (versión liviana: solo catálogo + docs + a11y, sin stack de testing).
- Alias de imports: `@/` → `src/` (ej: `import { cn } from '@/lib/utils'`).

## Comandos

```bash
npm run storybook    # catálogo/documentación de componentes (puerto 6006)
npm run dev          # playground rápido (puerto 5173)
npm run build        # compila la librería a dist/
npm run build-storybook  # Storybook estático en storybook-static/
npm run typecheck    # chequeo de tipos (tsc --noEmit)
```

Después de crear o modificar componentes, correr `npm run typecheck`.

## Estructura

```
src/
├── components/
│   └── ui/            # Componentes shadcn/ui (button, input, card, label, ...)
│       └── *.stories.tsx   # Stories de Storybook (co-locadas)
├── lib/utils.ts       # cn() — merge de clases de Tailwind
├── styles/theme.css   # design tokens (:root / .dark / @theme inline)
├── playground.tsx     # entry del playground de desarrollo
├── vite-env.d.ts      # tipos de Vite (imports de .css, etc.)
└── index.ts           # API pública (re-exporta todos los componentes)
```

## Cómo agregar un componente de shadcn/ui

1. Instalarlo con el CLI:
   ```bash
   npx shadcn@latest add <nombre>   # ej: dialog, select, table, badge
   ```
   Se crea en `src/components/ui/<nombre>.tsx`.

2. **IMPORTANTE — revisar los imports después de agregar.** El CLI de shadcn en
   este proyecto tiene un bug conocido al resolver el alias:
   - Genera `import { cn } from "cn"` → **cambiarlo** a
     `import { cn } from "@/lib/utils"`.
   - A veces instala un paquete espurio llamado `cn` en `package.json`
     (dependencia ajena) → si aparece, **desinstalarlo**: `npm uninstall cn`.
   - Los imports de `radix-ui` (paquete unificado) **sí** son correctos.

3. Exportar el componente en `src/index.ts`:
   ```ts
   export * from './components/ui/<nombre>';
   ```

4. Crear su story `src/components/ui/<nombre>.stories.tsx` (ver ejemplo en
   `button.stories.tsx`).

5. Correr `npm run typecheck`.

## Cómo personalizar / crear componentes propios

Los componentes de `src/components/ui/` son **tuyos**: editalos para ajustar
estilos, variantes y comportamiento a 3B. Para componentes nuevos desde cero,
seguí el mismo patrón (named exports, `cn()` para clases, props tipadas,
`React.ComponentProps<...>`), co-locá su `.stories.tsx` y exportá desde
`src/index.ts`.

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

- Definir colores, radios y tipografía en `src/styles/theme.css`, en los bloques
  `:root` (claro) y `.dark` (oscuro). Preferir color en **oklch**.
- El mapeo a utilidades de Tailwind vive en `@theme inline`
  (ej: `--color-primary: var(--primary)` habilita `bg-primary`, `text-primary`).
- Para la identidad de 3B, editar los valores de `--primary`, `--secondary`,
  `--accent`, `--radius`, etc. Los componentes consumen estos tokens, así que
  cambiarlos re-tematiza todo el sistema.
- No hardcodear colores/espaciados en componentes si existe un token.

## Reglas de calidad

- Componentes **accesibles**: HTML semántico, roles/aria cuando corresponda,
  foco visible. El addon de a11y de Storybook ayuda a detectar problemas.
- No introducir dependencias nuevas sin necesidad.
- Mantener `src/index.ts` como única API pública del paquete.
- Idioma: comentarios y documentación en español; nombres de código en inglés.
