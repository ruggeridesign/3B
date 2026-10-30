import { z } from 'zod';

/** Respuesta del endpoint de salud del sistema. */
export const HealthResponse = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
