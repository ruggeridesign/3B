/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from '@serwist/turbopack/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

// El service worker corre en su propio contexto (WorkerGlobalScope), no en el DOM.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Inyectado por el build de Serwist: el manifiesto de assets a precachear.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Activar la versión nueva del SW apenas instala, sin esperar a cerrar pestañas.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
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
