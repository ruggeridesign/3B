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

// ===== Atributos (definiciones con alcance + herencia) =====

/** Alcance de una definición de atributo (D-02): plataforma, categoría o tienda. */
export const AttributeScope = z.enum(['global', 'category', 'store']);
export type AttributeScope = z.infer<typeof AttributeScope>;

/** Tipo de dato del valor del atributo. */
export const AttributeDataType = z.enum(['text', 'number', 'boolean', 'enum']);
export type AttributeDataType = z.infer<typeof AttributeDataType>;

/** Clave máquina del atributo: minúsculas, empieza con letra, `a-z0-9_`. */
export const AttributeKey = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, 'Usá minúsculas, números y guion bajo.');

/** Definición de un atributo (no el valor; el valor va en el ítem, rebanada 2c). */
export const AttributeDefinition = z.object({
  id: z.string(),
  scope: AttributeScope,
  scopeId: z.string().nullable(),
  key: z.string(),
  label: z.string(),
  dataType: AttributeDataType,
  options: z.array(z.string()).nullable(), // valores permitidos si dataType=enum
  unit: z.string().nullable(),
  filterable: z.boolean(),
  variantAxis: z.boolean(),
  createdAt: z.string(),
});
export type AttributeDefinition = z.infer<typeof AttributeDefinition>;

/** Lista de definiciones de atributo (p. ej. las resueltas para una tienda). */
export const AttributeDefinitionList = z.object({
  attributes: z.array(AttributeDefinition),
});
export type AttributeDefinitionList = z.infer<typeof AttributeDefinitionList>;

/** Campos comunes al crear una definición. */
const attributeFields = {
  key: AttributeKey,
  label: z.string().min(1).max(80),
  dataType: AttributeDataType,
  options: z.array(z.string().min(1)).optional(),
  unit: z.string().max(16).optional(),
  filterable: z.boolean().optional(),
  variantAxis: z.boolean().optional(),
};

/** Alta de una definición con alcance de **tienda** (owner/admin/catalog). */
export const CreateStoreAttributeInput = z.object(attributeFields);
export type CreateStoreAttributeInput = z.infer<
  typeof CreateStoreAttributeInput
>;

/** Alta de una definición **global o de categoría** (solo admin de plataforma). */
export const CreateGlobalAttributeInput = z.object({
  scope: z.enum(['global', 'category']),
  scopeId: Uuid.nullable().optional(), // requerido si scope=category
  ...attributeFields,
});
export type CreateGlobalAttributeInput = z.infer<
  typeof CreateGlobalAttributeInput
>;

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

/** Valores de atributo del ítem: mapa `key → valor`. Se validan contra las
 * definiciones resueltas (global+categoría+tienda) en el servidor. */
export const AttributeValues = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);
export type AttributeValues = z.infer<typeof AttributeValues>;

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
  attributes: AttributeValues,
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
  attributes: AttributeValues.optional(),
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
  attributes: AttributeValues.optional(),
});
export type UpdateItemInput = z.infer<typeof UpdateItemInput>;

// ===== Variantes de ítem =====

/** SKU de variante: alfanumérico con guiones/guion bajo; único por ítem. */
export const Sku = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[A-Za-z0-9_-]+$/, 'SKU: letras, números, guion y guion bajo.');

/** Una variante (combinación de ejes) de un ítem. */
export const ItemVariant = z.object({
  id: z.string(),
  itemId: z.string(),
  sku: z.string(),
  barcode: z.string().nullable(),
  axisValues: AttributeValues,
  priceAmount: z.string().nullable(),
  trackStock: z.boolean(),
  createdAt: z.string(),
});
export type ItemVariant = z.infer<typeof ItemVariant>;

/** Lista de variantes de un ítem. */
export const ItemVariantList = z.object({ variants: z.array(ItemVariant) });
export type ItemVariantList = z.infer<typeof ItemVariantList>;

/** Alta de una variante. Los ejes deben ser atributos con `variant_axis`. */
export const CreateVariantInput = z.object({
  sku: Sku,
  barcode: z.string().max(64).optional(),
  axisValues: AttributeValues.optional(),
  priceAmount: MoneyAmount.optional(),
  trackStock: z.boolean().optional(),
});
export type CreateVariantInput = z.infer<typeof CreateVariantInput>;

/** Edición parcial de una variante. */
export const UpdateVariantInput = z.object({
  barcode: z.string().max(64).nullable().optional(),
  axisValues: AttributeValues.optional(),
  priceAmount: MoneyAmount.nullable().optional(),
  trackStock: z.boolean().optional(),
});
export type UpdateVariantInput = z.infer<typeof UpdateVariantInput>;

// ===== Detalle de servicio (ítems sin stock) =====

/** Dónde se presta el servicio: en el local, a domicilio o de forma remota. */
export const ServiceModality = z.enum(['in_store', 'on_site', 'remote']);
export type ServiceModality = z.infer<typeof ServiceModality>;

/** Datos propios de un ítem de tipo servicio (1:0..1 con el ítem). */
export const ServiceDetail = z.object({
  itemId: z.string(),
  durationMin: z.number().int().nullable(),
  modality: ServiceModality,
  coverageKm: z.number().int().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type ServiceDetail = z.infer<typeof ServiceDetail>;

/**
 * Alta/edición del detalle de servicio (upsert). `coverageKm` solo tiene sentido
 * con `modality='on_site'`; el resto son datos orientativos del turno.
 */
export const UpsertServiceDetailInput = z.object({
  durationMin: z.number().int().positive().max(100000).nullable().optional(),
  modality: ServiceModality.default('in_store'),
  coverageKm: z.number().int().positive().max(10000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpsertServiceDetailInput = z.infer<typeof UpsertServiceDetailInput>;
