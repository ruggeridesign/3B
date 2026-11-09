import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type ApiVariables, requireSession, sessionCtx } from '../../../http';
import { notifyUser } from '../application/notify-user';
import type { VapidConfig } from '../infra/push-sender';
import {
  deleteSubscription,
  upsertSubscription,
} from '../infra/subscription-repo';

// Esquemas OpenAPI/validación inline con la `z` de @hono/zod-openapi (espejan los
// DTOs de @3b/contracts/notifications; esa `z` es la que trae `.openapi()`).
const errorSchema = z
  .object({ error: z.string() })
  .openapi('NotificationsError');
const okSchema = z.object({ ok: z.boolean() }).openapi('NotificationsOk');
const testResult = z
  .object({ sent: z.number().int(), pruned: z.number().int() })
  .openapi('PushTestResult');

const subInput = z
  .object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  })
  .openapi('PushSubscriptionInput');
const delInput = z
  .object({ endpoint: z.string().url() })
  .openapi('DeletePushSubscriptionInput');
const vapidOut = z.object({ publicKey: z.string() }).openapi('VapidPublicKey');

/**
 * Router del módulo notifications (M8d). Web Push con VAPID: la web obtiene la clave
 * pública, se suscribe (upsert por endpoint) o se da de baja, y puede enviarse una
 * notificación de **prueba** a sus propios dispositivos. El envío por eventos de
 * dominio (worker/outbox) es M8d.2.
 */
export function notificationsRouter(opts: { vapid: VapidConfig }) {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();

  // La clave pública VAPID no es secreta (va al navegador para suscribirse); no
  // exige sesión. Las demás rutas sí.
  app.openapi(
    createRoute({
      method: 'get',
      path: '/notifications/vapid-public-key',
      tags: ['notifications'],
      summary: 'Clave pública VAPID',
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: vapidOut } },
        },
      },
    }),
    (c) => c.json({ publicKey: opts.vapid.publicKey }, 200),
  );

  app.use('/notifications/subscriptions', requireSession);
  app.use('/notifications/test', requireSession);

  // Suscribirse (upsert por endpoint).
  app.openapi(
    createRoute({
      method: 'post',
      path: '/notifications/subscriptions',
      tags: ['notifications'],
      summary: 'Suscribirse a push',
      request: {
        body: { content: { 'application/json': { schema: subInput } } },
      },
      responses: {
        200: {
          description: 'Suscripto',
          content: { 'application/json': { schema: okSchema } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const input = c.req.valid('json');
      await upsertSubscription(
        db,
        userId,
        input,
        c.req.header('user-agent') ?? null,
      );
      return c.json({ ok: true }, 200);
    },
  );

  // Darse de baja (por endpoint).
  app.openapi(
    createRoute({
      method: 'delete',
      path: '/notifications/subscriptions',
      tags: ['notifications'],
      summary: 'Darse de baja de push',
      request: {
        body: { content: { 'application/json': { schema: delInput } } },
      },
      responses: {
        200: {
          description: 'Dado de baja',
          content: { 'application/json': { schema: okSchema } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { endpoint } = c.req.valid('json');
      await deleteSubscription(db, endpoint);
      return c.json({ ok: true }, 200);
    },
  );

  // Auto-test: enviarme una notificación de prueba a mis dispositivos.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/notifications/test',
      tags: ['notifications'],
      summary: 'Enviarme una notificación de prueba',
      responses: {
        200: {
          description: 'Enviado',
          content: { 'application/json': { schema: testResult } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const res = await notifyUser(
        db,
        userId,
        {
          title: '3B',
          body: 'Tus notificaciones están activas.',
          url: '/',
          tag: 'test',
        },
        opts.vapid,
      );
      return c.json(res, 200);
    },
  );

  return app;
}
