import { z } from 'zod';
import { Uuid } from './store';

/**
 * Contratos del módulo `catalog`. Rebanada 1: **ítems**. Rebanada 2:
 * **categorías** (taxonomía global) + asignación a ítems. Atributos, variantes y
 * búsqueda llegan después. Dinero: `numeric` como string + moneda explícita.
 */

// ===== Categorías (taxonomía global) =====

/** Para qué sirve la categoría. */
export const CategoryKind = z.enum(['product', 'service', 'both']);
export type CategoryKind = z.infer<typeof CategoryKind>;

/** Slug de categoría: minúsculas, alfanumérico con guiones; único global. */
export const CategorySlug = z
  .string()
  .min(2)
  .max(60)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Usá minúsculas, números y guiones (sin espacios).',
  );

/** Una categoría del árbol (taxonomía de plataforma). */
export const Category = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  kind: CategoryKind,
  createdAt: z.string(),
});
export type Category = z.infer<typeof Category>;

/** Lista de categorías (el árbol se arma en el cliente con `parentId`). */
export const CategoryList = z.object({ categories: z.array(Category) });
export type CategoryList = z.infer<typeof CategoryList>;

/** Alta de una categoría (solo admin de plataforma). */
export const CreateCategoryInput = z.object({
  name: z.string().min(2).max(80),
  slug: CategorySlug,
  kind: CategoryKind,
  parentId: Uuid.nullable().optional(),
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;

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
  categoryId: z.string().nullable(),
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
  categoryId: Uuid.nullable().optional(),
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
  categoryId: Uuid.nullable().optional(),
  priceAmount: MoneyAmount.nullable().optional(),
  currency: Currency.optional(),
  priceMode: PriceMode.optional(),
  status: ItemStatus.optional(),
});
export type UpdateItemInput = z.infer<typeof UpdateItemInput>;
