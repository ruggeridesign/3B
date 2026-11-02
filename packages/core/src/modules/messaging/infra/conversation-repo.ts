import type {
  Conversation,
  Message,
  MessageThread,
  SendMessageInput,
} from '@3b/contracts';
import { type AppTransaction, and, eq, isNull, ne, schema } from '@3b/db';
import { getOrder } from '../../orders';

type ConversationRow = typeof schema.conversations.$inferSelect;
type MessageRow = typeof schema.messages.$inferSelect;

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    context: row.context as Conversation['context'],
    contextId: row.contextId,
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    body: row.body,
    mediaId: row.mediaId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Resuelve (y crea si falta) la conversación del contexto `order`. Devuelve null
 * si el pedido no es visible para el usuario del contexto (la RLS de `orders` lo
 * oculta). La creación es idempotente por el único `(context, context_id)`: ante
 * una carrera, `onConflictDoNothing` + relectura devuelven la fila ganadora. La
 * RLS de `conversations` exige ser participante del pedido para insertar.
 */
async function orderConversation(
  db: AppTransaction,
  orderId: string,
): Promise<ConversationRow | null> {
  const order = await getOrder(db, orderId);
  if (!order) return null;

  const [existing] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.context, 'order'),
        eq(schema.conversations.contextId, orderId),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(schema.conversations)
    .values({ context: 'order', contextId: orderId })
    .onConflictDoNothing({
      target: [schema.conversations.context, schema.conversations.contextId],
    })
    .returning();
  if (created) return created;

  // Carrera: otro request la creó entre el select y el insert → relectura.
  const [row] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.context, 'order'),
        eq(schema.conversations.contextId, orderId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Hilo (conversación + mensajes en orden cronológico) del pedido dado. Crea la
 * conversación de forma perezosa al abrirla. null si el pedido no es visible.
 */
export async function getOrderThread(
  db: AppTransaction,
  orderId: string,
): Promise<MessageThread | null> {
  const conv = await orderConversation(db, orderId);
  if (!conv) return null;

  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conv.id))
    .orderBy(schema.messages.createdAt);

  return { conversation: toConversation(conv), messages: rows.map(toMessage) };
}

/** Resultado de enviar un mensaje (para mapear a HTTP sin 500). */
export type SendResult =
  | { status: 'ok'; message: Message }
  | { status: 'not_found' };

/**
 * Envía un mensaje al hilo del pedido. Resuelve/crea la conversación, inserta el
 * mensaje (la RLS exige `sender_id` = usuario del contexto) y refresca
 * `last_message_at`. Todo en la transacción del request.
 */
export async function sendOrderMessage(
  db: AppTransaction,
  orderId: string,
  senderId: string,
  input: SendMessageInput,
): Promise<SendResult> {
  const conv = await orderConversation(db, orderId);
  if (!conv) return { status: 'not_found' };

  const [row] = await db
    .insert(schema.messages)
    .values({
      conversationId: conv.id,
      senderId,
      body: input.body,
      mediaId: input.mediaId ?? null,
    })
    .returning();

  await db
    .update(schema.conversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversations.id, conv.id));

  return { status: 'ok', message: toMessage(row as MessageRow) };
}

/**
 * Marca como leídos los mensajes **entrantes** del hilo (los que no envió el
 * lector) que aún no tenían `read_at`. Idempotente. No crea la conversación si no
 * existe. La RLS acota la actualización a participantes del pedido.
 */
export async function markOrderThreadRead(
  db: AppTransaction,
  orderId: string,
  readerId: string,
): Promise<void> {
  const [conv] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.context, 'order'),
        eq(schema.conversations.contextId, orderId),
      ),
    )
    .limit(1);
  if (!conv) return;

  await db
    .update(schema.messages)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.messages.conversationId, conv.id),
        ne(schema.messages.senderId, readerId),
        isNull(schema.messages.readAt),
      ),
    );
}
