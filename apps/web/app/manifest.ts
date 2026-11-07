import type { MetadataRoute } from 'next';

// Web App Manifest (M8a): hace a 3B instalable. Next lo sirve en
// /manifest.webmanifest y enlaza <link rel="manifest"> automáticamente.
// Colores de marca: crema de fondo (--background) y verde british (--primary).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: '3B — Marketplace comunitario',
    short_name: '3B',
    description: 'Comprá y vendé en tu comunidad: Sellers, Makers y Movers.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'es',
    dir: 'ltr',
    background_color: '#f4f2e0',
    theme_color: '#f4f2e0',
    categories: ['shopping', 'business'],
    icons: [
      {
        src: '/icons/192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
