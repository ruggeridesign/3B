import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createSerwistRoute } from '@serwist/turbopack';

// Revisión del precache: el SHA de git hace que la entrada offline se revalide en
// cada deploy. Fallback a un UUID si git no está disponible (p. ej. tarball).
const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf-8',
  }).stdout?.trim() || randomUUID();

// Construye y sirve el service worker (y sus chunks) bajo /serwist/*. Reemplaza al
// plugin de webpack de `@serwist/next`, incompatible con el build de Turbopack.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: '/~offline', revision }],
    swSrc: 'app/sw.ts',
    // Windows usa esbuild nativo por defecto; lo fijamos para builds reproducibles
    // en Linux/CI también (la dep `esbuild` está instalada).
    useNativeEsbuild: true,
  });
