import type { HealthResponse } from '@3b/contracts';

/**
 * Capa domain: función pura, sin frameworks ni I/O.
 * Construye el estado de salud a partir de datos ya resueltos.
 */
export function buildHealth(params: {
  service: string;
  version: string;
  now: Date;
}): HealthResponse {
  return {
    status: 'ok',
    service: params.service,
    version: params.version,
    timestamp: params.now.toISOString(),
  };
}
