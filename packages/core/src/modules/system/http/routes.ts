import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getHealth } from '../application/get-health';

// El esquema OpenAPI se declara con el `z` de @hono/zod-openapi (para la
// documentación). El contrato canónico vive en @3b/contracts (HealthResponse);
// ambos describen la misma forma. En fases posteriores se unifican.
const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.string(),
    version: z.string(),
    timestamp: z.string(),
  })
  .openapi('HealthResponse');

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['system'],
  summary: 'Estado del sistema',
  responses: {
    200: {
      description: 'El sistema está operativo.',
      content: { 'application/json': { schema: healthResponseSchema } },
    },
  },
});

/** Adaptador HTTP del módulo system. Lo monta apps/api. */
export function systemRouter() {
  const app = new OpenAPIHono();
  app.openapi(healthRoute, (c) =>
    c.json(getHealth({ service: '3b-api', version: '0.0.0' }), 200),
  );
  return app;
}
