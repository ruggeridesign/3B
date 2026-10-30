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

export default config;
