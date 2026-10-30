/**
 * Reglas de límites de arquitectura de 3B (dependency-cruiser).
 * Se ejecuta desde la raíz: `pnpm boundaries`.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'No se permiten dependencias circulares.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-module-via-index',
      comment:
        'Un módulo de core solo puede importar el index.ts público de otro módulo, no sus internos.',
      severity: 'error',
      from: { path: '^packages/core/src/modules/([^/]+)/' },
      to: {
        path: '^packages/core/src/modules/([^/]+)/.+',
        pathNot: [
          '^packages/core/src/modules/$1/',
          '^packages/core/src/modules/[^/]+/index\\.ts$',
        ],
      },
    },
    {
      name: 'domain-sin-frameworks',
      comment:
        'La capa domain es pura: no depende de Hono, Drizzle, el driver de Postgres ni de packages/db.',
      severity: 'error',
      from: { path: '^packages/core/src/modules/[^/]+/domain/' },
      to: {
        path: 'node_modules/(hono|@hono|drizzle-orm|postgres)|^packages/db',
      },
    },
    {
      name: 'web-no-core-ni-db',
      comment:
        'apps/web no accede a la lógica de negocio ni a la base: solo consume @3b/api-client, @3b/ui y @3b/contracts.',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: {
        path: '^packages/db|^packages/core/src/modules/[^/]+/(infra|domain|application)/',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'types', 'default'],
    },
  },
};
