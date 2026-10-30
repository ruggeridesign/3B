import type { HealthResponse } from '@3b/contracts';
import { buildHealth } from '../domain/health';

export interface GetHealthInput {
  service: string;
  version: string;
}

/**
 * Caso de uso: independiente del canal (HTTP hoy, MCP mañana).
 * La entrada HTTP (Hono) y, a futuro, MCP son adaptadores sobre esta función.
 */
export function getHealth(input: GetHealthInput): HealthResponse {
  return buildHealth({
    service: input.service,
    version: input.version,
    now: new Date(),
  });
}
