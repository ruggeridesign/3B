import { z } from 'zod';

/**
 * Contratos del módulo `orders`. **M5a — carrito + checkout**: el carrito es
 * multitienda (cliente), pero cada checkout crea **un pedido por tienda** en
 * estado `realizado`, con **precios/título congelados** (O-1) y snapshot de
 * dirección. La creación exige `Idempotency-Key` (O-4). La máquina de estados
 * (transiciones) y la **reserva de stock** llegan en M5b.
 */

// UUID laxo (acepta los del seed, que no son v4 estrictos).
const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const currency = z.string().regex(/^[A-Z]{3}$/);

/**
 * Estados del pedido de productos (§6 del modelo de datos). El enum es la fuente
 * de verdad para toda la máquina; **M5a solo crea `realizado`** y las
 * transiciones se habilitan en M5b.
 */
export const OrderStatus = z.enum([
  'realizado',
  'aceptado',
  'rechazado',
  'expirado',
  'pago_reportado',
  'pago_confirmado',
  'pago_rechazado',
  'en_preparacion',
  'listo',
  'retirado',
  'en_envio',
  'entregado',
  'completado',
  'en_disputa',
  'cancelado',
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

/** Modo de entrega: retiro en tienda, envío a domicilio o servicio. */
export const OrderFulfillment = z.enum(['pickup', 'delivery', 'service']);
export type OrderFulfillment = z.infer<typeof OrderFulfillment>;

/** Dirección **congelada** en el pedido (snapshot para envío a domicilio). */
export const OrderAddressSnapshot = z.object({
  label: z.string().max(80).optional(),
  line1: z.string().min(2).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
  phone: z.string().max(40).optional(),
  notes: z.string().max(300).optional(),
});
export type OrderAddressSnapshot = z.infer<typeof OrderAddressSnapshot>;

/** Línea del pedido con título/SKU/precio **congelados** al crearla (O-1). */
export const OrderItemLine = z.object({
  id: z.string(),
  variantId: z.string().nullable(),
  itemId: z.string().nullable(),
  title: z.string(),
  sku: z.string().nullable(),
  unitPrice: money,
  currency,
  qty: z.number().int().positive(),
  lineTotal: money,
});
export type OrderItemLine = z.infer<typeof OrderItemLine>;

/** Evento de la bitácora del pedido (inmutable, §6/O-2). */
export const OrderEvent = z.object({
  id: z.string(),
  fromStatus: OrderStatus.nullable(),
  toStatus: OrderStatus,
  actorId: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type OrderEvent = z.infer<typeof OrderEvent>;

/** Pedido (un pedido por tienda). Montos en `numeric` + moneda explícita. */
export const Order = z.object({
  id: z.string(),
  number: z.number().int(),
  storeId: z.string(),
  storeName: z.string().nullable(),
  communityId: z.string(),
  makerId: z.string(),
  status: OrderStatus,
  fulfillment: OrderFulfillment,
  subtotal: money,
  shippingAmount: money,
  feeAmount: money,
  total: money,
  currency,
  fxRateVes: z.string().nullable(),
  addressSnapshot: OrderAddressSnapshot.nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(OrderItemLine),
  events: z.array(OrderEvent).optional(),
});
export type Order = z.infer<typeof Order>;

/** Lista de pedidos. */
export const OrderList = z.object({ orders: z.array(Order) });
export type OrderList = z.infer<typeof OrderList>;

/**
 * Quién dispara una transición de la máquina de estados (§6). `seller` = miembro
 * de la tienda receptora; `maker` = dueño del pedido; `system` = automático
 * (worker/plazos, Movers) — no lo dispara una persona por la API.
 */
export const OrderActor = z.enum(['seller', 'maker', 'system']);
export type OrderActor = z.infer<typeof OrderActor>;

/** Una arista de la máquina de estados del pedido (§6). */
export interface OrderTransition {
  from: OrderStatus;
  to: OrderStatus;
  by: OrderActor;
}

/**
 * **Fuente única** de la máquina de estados del pedido de productos (§6 del
 * modelo de datos). Cada arista indica de qué estado a qué estado y **quién** la
 * dispara. La lógica pura (validar, próximos estados, efecto sobre stock) vive en
 * `@3b/core/modules/orders` (domain); la cara web la filtra por actor para armar
 * los botones. Las aristas de pago (`pago_*`) se habilitan en M5c; el cierre por
 * **retiro en tienda** (`retirado → completado`, el comprador confirma) en M5d; y
 * las de envío (`en_envio`/`entregado`) en M6 (actor `system`/Mover).
 */
export const ORDER_TRANSITIONS: readonly OrderTransition[] = [
  { from: 'realizado', to: 'aceptado', by: 'seller' },
  { from: 'realizado', to: 'rechazado', by: 'seller' },
  { from: 'realizado', to: 'expirado', by: 'system' },
  { from: 'aceptado', to: 'pago_reportado', by: 'maker' },
  { from: 'aceptado', to: 'listo', by: 'seller' }, // pago contra entrega
  { from: 'aceptado', to: 'cancelado', by: 'maker' },
  { from: 'pago_reportado', to: 'pago_confirmado', by: 'seller' },
  { from: 'pago_reportado', to: 'pago_rechazado', by: 'seller' },
  { from: 'pago_reportado', to: 'cancelado', by: 'maker' },
  { from: 'pago_confirmado', to: 'en_preparacion', by: 'seller' },
  { from: 'en_preparacion', to: 'listo', by: 'seller' },
  { from: 'listo', to: 'retirado', by: 'seller' }, // retiro en tienda
  { from: 'retirado', to: 'completado', by: 'maker' }, // el comprador confirma (M5d)
  { from: 'listo', to: 'en_envio', by: 'system' }, // Mover asignado (M6)
  { from: 'en_envio', to: 'entregado', by: 'system' }, // valida PIN (M6c, trigger)
  { from: 'entregado', to: 'completado', by: 'maker' }, // el comprador confirma (M6c)
  { from: 'entregado', to: 'en_disputa', by: 'maker' },
];

/**
 * Entrada para mover un pedido a otro estado. `toStatus` debe ser alcanzable
 * desde el estado actual según `ORDER_TRANSITIONS`; `reason` queda en la bitácora.
 */
export const OrderTransitionInput = z.object({
  toStatus: OrderStatus,
  reason: z.string().max(300).optional(),
});
export type OrderTransitionInput = z.infer<typeof OrderTransitionInput>;

/** Una línea del carrito al hacer checkout (variante + cantidad). */
export const CheckoutLineInput = z.object({
  variantId: uuid,
  qty: z.number().int().positive().max(999),
});
export type CheckoutLineInput = z.infer<typeof CheckoutLineInput>;

/**
 * Alta de pedido: checkout de **una** tienda. Si `fulfillment` es `delivery`,
 * `address` es obligatoria (lo valida el handler). Requiere `Idempotency-Key`
 * en la cabecera: un reintento con la misma clave devuelve el pedido ya creado.
 */
export const CreateOrderInput = z.object({
  storeId: uuid,
  fulfillment: OrderFulfillment,
  items: z.array(CheckoutLineInput).min(1).max(50),
  address: OrderAddressSnapshot.optional(),
  note: z.string().max(500).optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;
