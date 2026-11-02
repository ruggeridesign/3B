import { z } from 'zod';

/**
 * Contratos del módulo `messaging`. **M5d — chat contextual**: una conversación
 * cuelga de un contexto (pedido/ítem/envío/tienda) y agrupa mensajes. **M5d.1**
 * cablea solo el contexto `order` (el hilo del pedido entre el comprador y la
 * tienda); el resto de contextos queda definido pero llega en rebanadas
 * posteriores. Hay **una** conversación por `(context, context_id)`.
 */

// UUID laxo (acepta los del seed, que no son v4 estrictos).
const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/** Contexto al que pertenece una conversación (§2.5 del modelo de datos). */
export const ConversationContext = z.enum([
  'item',
  'order',
  'shipment',
  'store',
]);
export type ConversationContext = z.infer<typeof ConversationContext>;

/** Cabecera de una conversación (hilo). */
export const Conversation = z.object({
  id: z.string(),
  context: ConversationContext,
  contextId: z.string(),
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Conversation = z.infer<typeof Conversation>;

/** Un mensaje del hilo. `readAt` marca cuándo lo leyó la contraparte. */
export const Message = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  body: z.string(),
  mediaId: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof Message>;

/** Hilo completo: la conversación + sus mensajes (orden cronológico). */
export const MessageThread = z.object({
  conversation: Conversation,
  messages: z.array(Message),
});
export type MessageThread = z.infer<typeof MessageThread>;

/** Enviar un mensaje a un hilo. `mediaId` (adjunto) queda previsto. */
export const SendMessageInput = z.object({
  body: z.string().min(1).max(2000),
  mediaId: uuid.optional(),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;
