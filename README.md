# 3B · Design System

Design system de **3B** — un sistema de gestión de negocios fácil de aplicar y con MCPs.

Este repositorio contiene los fundamentos visuales (design tokens) y la librería
de componentes de React que consume la aplicación de 3B.

## Stack

- **React 19** + **TypeScript**
- **Vite** (modo librería + playground de desarrollo)
- **Tailwind CSS v4** (tokens vía `:root` / `@theme inline`)
- **shadcn/ui** como base de componentes (copiados al repo y personalizables)
- **Storybook** (versión liviana: catálogo + docs + a11y)

## Requisitos

- Node.js >= 20 (este proyecto usa Node 24)
- npm

## Primeros pasos

```bash
npm install          # instala dependencias
npm run storybook    # abre Storybook en http://localhost:6006
npm run dev          # playground de Vite en http://localhost:5173
```

## Scripts

| Script                    | Descripción                                             |
| ------------------------- | ------------------------------------------------------- |
| `npm run dev`             | Playground de desarrollo (Vite).                        |
| `npm run storybook`       | Storybook para ver/documentar componentes.              |
| `npm run build`           | Compila el design system a `dist/` (modo librería).     |
| `npm run build-storybook` | Genera Storybook estático en `storybook-static/`.       |
| `npm run typecheck`       | Chequeo de tipos con TypeScript.                        |

## Estructura

```
src/
├── components/
│   └── ui/            # Componentes shadcn/ui + sus .stories.tsx
├── lib/
│   └── utils.ts       # Helpers (cn() para clases de Tailwind)
├── styles/
│   └── theme.css      # Design tokens (:root / .dark / @theme inline)
├── playground.tsx     # Entry del playground de desarrollo
└── index.ts           # API pública del paquete
```

## Cómo agregar un componente

```bash
npx shadcn@latest add <nombre>   # ej: dialog, select, badge, table
```

> Después de agregar, revisá que el import sea `from '@/lib/utils'` y exportá el
> componente en `src/index.ts`. La guía completa (incluido un bug conocido del
> CLI de shadcn y cómo resolverlo) está en [`CLAUDE.md`](./CLAUDE.md).

## Licencia

Privado — © 3B.
