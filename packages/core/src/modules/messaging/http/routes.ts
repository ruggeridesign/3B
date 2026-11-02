import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { type ApiVariables, requireSession, sessionCtx } from '../../../http';
import {
  getOrderThread,
  markOrderThreadRead,
  sendOrderMessage,
} from '../infra/conversation-repo';

const conversationOut = z
  .object({
    id: z.string(),
    context: z.enum(['item', 'order', 'shipment', 'store']),
    contextId: z.string(),
    lastMessageAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Conversation');

const messageOut = z
  .object({
    id: z.string(),
    conversationId: z.string(),
    senderId: z.string(),
    body: z.string(),
    mediaId: z.string().nullable(),
    readAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Message');

const threadOut = z
  .object({ conversation: conversationOut, messages: z.array(messageOut) })
  .openapi('MessageThread');

const sendBody = z
  .object({
    body: z.string().min(1).max(2000),
    mediaId: z.string().optional(),
  })
  .openapi('SendMessage');

const errorSchema = z.object({ error: z.string() }).openapi('MessagingError');

const orderParam = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
});

/**
 * Router del módulo messaging (M5d.1). Chat contextual del pedido: el hilo lo
 * ven/escriben el comprador (Maker) y los miembros de la tienda (la RLS, derivada
 * del pedido, es el candado). El hilo se crea de forma perezosa al abrirlo.
 */
export function messagingRouter() {
  const app = new OpenAPIHono<{ Variables: ApiVariables }>();
  app.use('*', requireSession);

  // Abrir el hilo del pedido (conversación + mensajes).
  app.openapi(
    createRoute({
      method: 'get',
      path: '/orders/{id}/conversation',
      tags: ['messaging'],
      summary: 'Hilo de chat del pedido',
      request: { params: orderParam },
      responses: {
        200: {
          description: 'OK',
          content: { 'application/json': { schema: threadOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'El pedido no existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const thread = await getOrderThread(db, id);
      if (!thread) return c.json({ error: 'No encontrado.' }, 404);
      return c.json(thread, 200);
    },
  );

  // Enviar un mensaje al hilo del pedido.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/orders/{id}/messages',
      tags: ['messaging'],
      summary: 'Enviar un mensaje al hilo del pedido',
      request: {
        params: orderParam,
        body: { content: { 'application/json': { schema: sendBody } } },
      },
      responses: {
        201: {
          description: 'Mensaje enviado',
          content: { 'application/json': { schema: messageOut } },
        },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
        404: {
          description: 'El pedido no existe o no es visible',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const res = await sendOrderMessage(db, id, userId, body);
      if (res.status === 'not_found') {
        return c.json({ error: 'No encontrado.' }, 404);
      }
      return c.json(res.message, 201);
    },
  );

  // Marcar como leídos los mensajes entrantes del hilo.
  app.openapi(
    createRoute({
      method: 'post',
      path: '/orders/{id}/conversation/read',
      tags: ['messaging'],
      summary: 'Marcar el hilo como leído',
      request: { params: orderParam },
      responses: {
        204: { description: 'Marcado como leído' },
        401: {
          description: 'No autenticado',
          content: { 'application/json': { schema: errorSchema } },
        },
      },
    }),
    async (c) => {
      const { db, userId } = sessionCtx(c);
      const { id } = c.req.valid('param');
      await markOrderThreadRead(db, id, userId);
      return c.body(null, 204);
    },
  );

  return app;
}
