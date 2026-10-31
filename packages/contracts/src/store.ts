import { z } from 'zod';

/**
 * Contratos del módulo `store` (tienda). Fuente única de verdad entre la API,
 * el core y la web. La capacidad de Seller se obtiene teniendo al menos una
 * tienda (membresía); ver `StoreRole` en `./identity`.
 */

/** Tipo de tienda: vende productos o servicios. */
export const StoreKind = z.enum(['products', 'services']);
export type StoreKind = z.infer<typeof StoreKind>;

/** Estado operativo de la tienda. */
export const StoreStatus = z.enum(['active', 'suspended']);
export type StoreStatus = z.infer<typeof StoreStatus>;

/** Slug de tienda: minúsculas, alfanumérico con guiones; único por comunidad. */
export const StoreSlug = z
  .string()
  .min(2)
  .max(40)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Usá minúsculas, números y guiones (sin espacios).',
  );

/**
 * UUID en forma 8-4-4-4-12 (hex), lenient: acepta cualquier variante/versión
 * (incluidos los UUID deterministas del seed, que no cumplen la variante RFC).
 * La columna Postgres `uuid` también los acepta.
 */
export const Uuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'UUID inválido',
  );

/** Entrada para abrir una tienda. El dueño es el usuario autenticado (servidor). */
export const CreateStoreInput = z.object({
  communityId: Uuid,
  kind: StoreKind,
  slug: StoreSlug,
  name: z.string().min(2).max(80),
});
export type CreateStoreInput = z.infer<typeof CreateStoreInput>;

/** Representación pública de una tienda. */
export const Store = z.object({
  id: z.string(),
  communityId: z.string(),
  ownerId: z.string(),
  kind: StoreKind,
  slug: z.string(),
  name: z.string(),
  status: StoreStatus,
  createdAt: z.string(),
});
export type Store = z.infer<typeof Store>;

/** Lista de tiendas (p. ej. las del usuario). */
export const StoreList = z.object({ stores: z.array(Store) });
export type StoreList = z.infer<typeof StoreList>;
