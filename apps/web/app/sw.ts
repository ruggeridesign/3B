/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from '@serwist/turbopack/worker';
import {
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  type PrecacheEntry,
  type RuntimeCaching,
  Serwist,
  type SerwistGlobalConfig,
} from 'serwist';

// El service worker corre en su propio contexto (WorkerGlobalScope), no en el DOM.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Inyectado por el build de Serwist: el manifiesto de assets a precachear.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Caché del BFF (M8b): la web habla same-origin con /v1 (Next proxya a la API) y
// /api/auth (Better Auth). Estas reglas van ANTES de defaultCache (gana la primera
// que matchea).
const apiCache: RuntimeCaching[] = [
  {
    // Sesión: nunca servir de caché. Siempre a la red (y si falla, falla).
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && url.pathname.startsWith('/api/auth'),
    handler: new NetworkOnly(),
  },
  {
    // Lecturas de datos: red primero; si no hay red (o tarda >3s), servir lo último
    // visto. Solo GET: las mutaciones (POST/PATCH) caen a la red (su cola offline es
    // M8c). Solo se cachean respuestas 200 (un 401 no pisa el dato cacheado).
    matcher: ({ url, sameOrigin, request }) =>
      sameOrigin && request.method === 'GET' && url.pathname.startsWith('/v1'),
    method: 'GET',
    handler: new NetworkFirst({
      cacheName: 'api-v1',
      networkTimeoutSeconds: 3,
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({
          maxEntries: 128,
          maxAgeSeconds: 24 * 60 * 60, // 1 día
          purgeOnQuotaError: true,
        }),
      ],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Activar la versión nueva del SW apenas instala, sin esperar a cerrar pestañas.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...apiCache, ...defaultCache],
  // Si una navegación falla sin red, servir la página /~offline (precacheada).
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

serwist.addEventListeners();
