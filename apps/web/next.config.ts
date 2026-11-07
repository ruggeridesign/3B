import { withSerwist } from '@serwist/turbopack';
import type { NextConfig } from 'next';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

const config: NextConfig = {
  // Transpila los paquetes del workspace que se publican como código fuente.
  transpilePackages: ['@3b/ui', '@3b/api-client', '@3b/contracts'],
  // BFF: el navegador habla SOLO con el web (same-origin); acá proxyamos a la API.
  // Así las cookies de sesión viven en el origen del web (sin CORS cross-port).
  async rewrites() {
    return [
      { source: '/api/auth/:path*', destination: `${API}/api/auth/:path*` },
      { source: '/v1/:path*', destination: `${API}/v1/:path*` },
    ];
  },
};

// PWA (M8): Serwist para Turbopack (Next 16 compila con Turbopack por defecto, lo
// que descarta el plugin de webpack de `@serwist/next`). El service worker se
// construye por un Route Handler (app/serwist/[path]/route.ts) y se registra con
// <SerwistProvider> en el layout. Ver docs/DDR.md (M8a).
export default withSerwist(config);
