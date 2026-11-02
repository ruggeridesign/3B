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
