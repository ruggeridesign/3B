import { z } from 'zod';

/**
 * Contratos del módulo `catalog`. Primera rebanada: **ítems** (producto o
 * servicio) de una tienda. Categorías, atributos, variantes y búsqueda llegan en
 * rebanadas siguientes. Dinero: `numeric` como string + moneda explícita.
 */

/** Un ítem es un producto o un servicio. */
export const ItemKind = z.enum(['product', 'service']);
export type ItemKind = z.infer<typeof ItemKind>;

/** Estado de publicación del ítem. */
export const ItemStatus = z.enum(['draft', 'published', 'archived']);
export type ItemStatus = z.infer<typeof ItemStatus>;

/** Modo de precio: fijo, "desde" (orientativo) o a cotizar. */
export const PriceMode = z.enum(['fixed', 'from', 'quote']);
export type PriceMode = z.infer<typeof PriceMode>;

/** Slug del ítem: minúsculas, alfanumérico con guiones; único por tienda. */
export const ItemSlug = z
  .string()
  .min(2)
  .max(60)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Usá minúsculas, números y guiones (sin espacios).',
  );

/** Monto de dinero como string decimal (hasta 2 decimales); nunca float. */
export const MoneyAmount = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Monto inválido (ej: 1990.00).');

/** Moneda ISO-4217 (3 letras mayúsculas). */
export const Currency = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Moneda inválida (ej: USD, VES).');

/** Representación pública de un ítem. */
export const Item = z.object({
  id: z.string(),
  storeId: z.string(),
  communityId: z.string(),
  kind: ItemKind,
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priceAmount: z.string().nullable(),
  currency: Currency,
  priceMode: PriceMode,
  status: ItemStatus,
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Item = z.infer<typeof Item>;

/** Lista de ítems (p. ej. los de una tienda). */
export const ItemList = z.object({ items: z.array(Item) });
export type ItemList = z.infer<typeof ItemList>;

/** Alta de un ítem. El `store_id` sale de la ruta; `community_id`, del trigger. */
export const CreateItemInput = z.object({
  kind: ItemKind,
  slug: ItemSlug,
  title: z.string().min(2).max(120),
  description: z.string().max(4000).optional(),
  priceAmount: MoneyAmount.optional(),
  currency: Currency.default('USD'),
  priceMode: PriceMode.default('fixed'),
  status: ItemStatus.default('draft'),
});
export type CreateItemInput = z.infer<typeof CreateItemInput>;

/** Edición parcial de un ítem. */
export const UpdateItemInput = z.object({
  title: z.string().min(2).max(120).optional(),
  description: z.string().max(4000).nullable().optional(),
  priceAmount: MoneyAmount.nullable().optional(),
  currency: Currency.optional(),
  priceMode: PriceMode.optional(),
  status: ItemStatus.optional(),
});
export type UpdateItemInput = z.infer<typeof UpdateItemInput>;
