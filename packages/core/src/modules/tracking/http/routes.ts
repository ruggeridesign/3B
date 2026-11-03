import type { LocationPing } from '@3b/contracts';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type ApiVariables, requireSession, sessionCtx } from '../../../http';
import { latestPing, postPing, recentTrack } from '../infra/ping-repo';

const pingOut = z
  .object({
    shipmentId: z.string(),
    lat: z.number(),
    lng: z.number(),
    speed: z.number().nullable(),
    heading: z.number().int().nullable(),
    recordedAt: z.string(),
  })
  .openapi('LocationPing');

const trackOut = z
  .object({ latest: pingOut.nullable(), track: z.array(pingOut) })
  .openapi('ShipmentTrack');

const postBody = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    speed: z.number().min(0).optional(),
    heading: z.number().int().min(0).max(359).optional(),
  })
  .openapi('PostPing');

const errorSchema = z.object({ error: z.string() }).openapi('TrackingError');

const idParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

/** Hook opcional: se llama tras postear un ping (lo usa apps/api para publicar a
 * Valkey en vivo). Si falla, no debe tumbar el request. */
export type OnPing = (shipmentId: string, ping: LocationPing) => void;

/**
 * Router del módulo tracking (M6c.2). El Mover asignado postea pings de posición
 * durante el viaje; el comprador/tienda (quien ve el envío) lee la última posición
 * y el recorrido. La RLS es el candado.
 */
export function trackingRouter(opts: { onPing?: OnPing } = {}) {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  // El Mover postea su posición.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/shipments/{id}/pings',
      tags: ['tracking'],
      summary: 'Postear posición (Mover)',
      request: {
        params: idParam,
        body: { content: { 'application/json': { schema: postBody } } },
      },
      responses: {
        201: {
          description: 'Ping registrado',
          content: { 'application/json': { schema: pingOut } },
        },
        400: {
          description: 'El viaje no está en curso',
          content: { 'application/json': { schema: errorSchema } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        403: {
          description: 'No sos el Mover asignado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'El envío no existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const res = await postPing(db, id, userId, body);
      if (res.status === 'not_found') {
        return c.json({ error: 'No encontrado.' }, 404);
      }
      if (res.status === 'not_assigned') {
        return c.json({ error: 'No sos el Mover asignado.' }, 403);
      }
      if (res.status === 'not_active') {
        return c.json({ error: 'El viaje no está en curso.' }, 400);
      }
      try {
        opts.onPing?.(id, res.ping);
      } catch {
        // publicar a Valkey es best-effort; no tumba el request.
      }
      return c.json(res.ping, 201);
    },
  );

  // Rastreo de un envío: última posición + recorrido reciente.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/shipments/{id}/track',
      tags: ['tracking'],
      summary: 'Rastreo de un envío',
      request: { params: idParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: trackOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const [latest, track] = await Promise.all([
        latestPing(db, id),
        recentTrack(db, id),
      ]);
      return c.json({ latest, track }, 200);
    },
  );

  return app;
}
