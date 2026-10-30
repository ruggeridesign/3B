import type { NextConfig } from 'next';

const config: NextConfig = {
  // Transpila los paquetes del workspace que se publican como código fuente.
  transpilePackages: ['@3b/ui', '@3b/api-client', '@3b/contracts'],
};

export default config;
