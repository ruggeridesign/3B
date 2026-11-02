import type { CreateOrderInput, Order, OrderItemLine } from '@3b/contracts';
import { type AppTransaction, and, desc, eq, inArray, schema } from '@3b/db';
import { computeTotals, type PriceLine } from '../domain/pricing';

type OrderRow = typeof schema.orderRecords.$inferSelect;
type ItemRow = typeof schema.orderItems.$inferSelect;
type EventRow = typeof schema.orderEvents.$inferSelect;

function toLine(row: ItemRow): OrderItemLine {
  return {
    id: row.id,
    variantId: row.variantId,
    itemId: row.itemId,
    title: row.title,
    sku: row.sku,
    unitPrice: row.unitPrice,
    currency: row.currency,
    qty: row.qty,
    lineTotal: row.lineTotal,
  };
}

function toOrder(
  row: OrderRow,
  storeName: string | null,
  items: OrderItemLine[],
  events?: Order['events'],
): Order {
  return {
    id: row.id,
    number: row.number,
    storeId: row.storeId,
    storeName,
    communityId: row.communityId,
    makerId: row.makerId,
    status: row.status as Order['status'],
    fulfillment: row.fulfillment as Order['fulfillment'],
    subtotal: row.subtotal,
    shippingAmount: row.shippingAmount,
    feeAmount: row.feeAmount,
    total: row.total,
    currency: row.currency,
    fxRateVes: row.fxRateVes,
    addressSnapshot: (row.addressSnapshot as Order['addressSnapshot']) ?? null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    items,
    ...(events ? { events } : {}),
  };
}

/** Ensambla un pedido (cabecera + tienda + líneas + bitácora) por id, o null. */
export async function getOrder(
  db: AppTransaction,
  id: string,
): Promise<Order | null> {
  const [head] = await db
    .select({ order: schema.orderRecords, storeName: schema.stores.name })
    .from(schema.orderRecords)
    .leftJoin(schema.stores, eq(schema.stores.id, schema.orderRecords.storeId))
    .where(eq(schema.orderRecords.id, id))
    .limit(1);
  if (!head) return null;

  const [lines, events] = await Promise.all([
    db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, id))
      .orderBy(schema.orderItems.createdAt),
    db
      .select()
      .from(schema.orderEvents)
      .where(eq(schema.orderEvents.orderId, id))
      .orderBy(schema.orderEvents.createdAt),
  ]);

  return toOrder(
    head.order,
    head.storeName,
    lines.map(toLine),
    events.map((e: EventRow) => ({
      id: e.id,
      fromStatus: (e.fromStatus as Order['status'] | null) ?? null,
      toStatus: e.toStatus as Order['status'],
      actorId: e.actorId,
      reason: e.reason,
      createdAt: e.createdAt.toISOString(),
    })),
  );
}

/** Carga las líneas de varios pedidos y arma los DTOs (sin bitácora). */
async function withLines(
  db: AppTransaction,
  rows: Array<{ order: OrderRow; storeName: string | null }>,
): Promise<Order[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.order.id);
  const lines = await db
    .select()
    .from(schema.orderItems)
    .where(inArray(schema.orderItems.orderId, ids))
    .orderBy(schema.orderItems.createdAt);
  const byOrder = new Map<string, OrderItemLine[]>();
  for (const l of lines) {
    const list = byOrder.get(l.orderId) ?? [];
    list.push(toLine(l));
    byOrder.set(l.orderId, list);
  }
  return rows.map((r) =>
    toOrder(r.order, r.storeName, byOrder.get(r.order.id) ?? []),
  );
}

/**
 * Pedidos realizados por el Maker dado (recientes primero). Se filtra por
 * `makerId` del contexto: la RLS además dejaría ver los de tiendas propias, pero
 * "mis pedidos" es solo lo que yo compré.
 */
export async function listMyOrders(
  db: AppTransaction,
  makerId: string,
): Promise<Order[]> {
  const rows = await db
    .select({ order: schema.orderRecords, storeName: schema.stores.name })
    .from(schema.orderRecords)
    .leftJoin(schema.stores, eq(schema.stores.id, schema.orderRecords.storeId))
    .where(eq(schema.orderRecords.makerId, makerId))
    .orderBy(desc(schema.orderRecords.createdAt));
  return withLines(db, rows);
}

/** Pedidos recibidos por una tienda (la RLS acota a miembros), recientes primero. */
export async function listStoreOrders(
  db: AppTransaction,
  storeId: string,
): Promise<Order[]> {
  const rows = await db
    .select({ order: schema.orderRecords, storeName: schema.stores.name })
    .from(schema.orderRecords)
    .leftJoin(schema.stores, eq(schema.stores.id, schema.orderRecords.storeId))
    .where(eq(schema.orderRecords.storeId, storeId))
    .orderBy(desc(schema.orderRecords.createdAt));
  return withLines(db, rows);
}

/** Resultado del checkout (para mapear a HTTP sin 500). */
export type CreateResult =
  | { status: 'ok'; order: Order }
  | { status: 'idempotent'; order: Order }
  | { status: 'store_not_found' }
  | { status: 'invalid_line'; detail: string };

type ResolvedLine = PriceLine & {
  variantId: string;
  itemId: string;
  title: string;
  sku: string;
};

/**
 * Crea un pedido en estado `realizado` desde el carrito de **una** tienda.
 * Congela título/SKU/precio por línea (O-1), calcula montos (dominio) y deja el
 * evento `→ realizado` en la bitácora. Idempotente por `(maker, idempotencyKey)`:
 * un reintento con la misma clave devuelve el pedido ya creado. Todo ocurre en la
 * transacción del request (atómico). La RLS es el candado final.
 */
export async function createOrder(
  db: AppTransaction,
  makerId: string,
  input: CreateOrderInput,
  idempotencyKey: string,
): Promise<CreateResult> {
  // Idempotencia: misma clave del mismo Maker ⇒ devolver el pedido existente.
  const [existing] = await db
    .select({ id: schema.orderRecords.id })
    .from(schema.orderRecords)
    .where(
      and(
        eq(schema.orderRecords.makerId, makerId),
        eq(schema.orderRecords.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) {
    const order = await getOrder(db, existing.id);
    if (order) return { status: 'idempotent', order };
  }

  // La tienda debe ser visible (RLS) para tomar su comunidad (D-05).
  const [store] = await db
    .select({ id: schema.stores.id, communityId: schema.stores.communityId })
    .from(schema.stores)
    .where(eq(schema.stores.id, input.storeId))
    .limit(1);
  if (!store) return { status: 'store_not_found' };

  // Resolver variantes del carrito: deben ser de la tienda, publicadas y con
  // precio concreto (no "a cotizar"). La RLS de variants/items las acota.
  const variantIds = input.items.map((i) => i.variantId);
  const rows = await db
    .select({
      variantId: schema.itemVariants.id,
      itemId: schema.items.id,
      title: schema.items.title,
      sku: schema.itemVariants.sku,
      variantPrice: schema.itemVariants.priceAmount,
      itemPrice: schema.items.priceAmount,
      currency: schema.items.currency,
      priceMode: schema.items.priceMode,
      status: schema.items.status,
    })
    .from(schema.itemVariants)
    .innerJoin(schema.items, eq(schema.items.id, schema.itemVariants.itemId))
    .where(
      and(
        inArray(schema.itemVariants.id, variantIds),
        eq(schema.items.storeId, input.storeId),
      ),
    );
  const byVariant = new Map(rows.map((r) => [r.variantId, r]));

  const resolved: ResolvedLine[] = [];
  for (const line of input.items) {
    const r = byVariant.get(line.variantId);
    if (!r) {
      return {
        status: 'invalid_line',
        detail: `La variante ${line.variantId} no existe en la tienda o no está disponible.`,
      };
    }
    if (r.status !== 'published') {
      return {
        status: 'invalid_line',
        detail: `"${r.title}" no está publicado.`,
      };
    }
    const unitPrice = r.variantPrice ?? r.itemPrice;
    if (r.priceMode === 'quote' || !unitPrice) {
      return {
        status: 'invalid_line',
        detail: `"${r.title}" requiere cotización; no se puede comprar directo.`,
      };
    }
    resolved.push({
      variantId: r.variantId,
      itemId: r.itemId,
      title: r.title,
      sku: r.sku,
      unitPrice,
      currency: r.currency,
      qty: line.qty,
    });
  }

  const totals = computeTotals(resolved); // M5a: sin envío ni comisión

  const [order] = await db
    .insert(schema.orderRecords)
    .values({
      storeId: input.storeId,
      communityId: store.communityId,
      makerId,
      status: 'realizado',
      fulfillment: input.fulfillment,
      subtotal: totals.subtotal,
      total: totals.total,
      currency: totals.currency,
      addressSnapshot: input.address ?? null,
      note: input.note ?? null,
      idempotencyKey,
    })
    .returning();
  const created = order as OrderRow;

  await db.insert(schema.orderItems).values(
    resolved.map((r, idx) => ({
      orderId: created.id,
      variantId: r.variantId,
      itemId: r.itemId,
      title: r.title,
      sku: r.sku,
      unitPrice: r.unitPrice,
      currency: r.currency,
      qty: r.qty,
      lineTotal: totals.lineTotals[idx] as string,
    })),
  );

  await db.insert(schema.orderEvents).values({
    orderId: created.id,
    fromStatus: null,
    toStatus: 'realizado',
    actorId: makerId,
    reason: 'Pedido realizado desde el carrito.',
  });

  const full = await getOrder(db, created.id);
  return { status: 'ok', order: full as Order };
}
