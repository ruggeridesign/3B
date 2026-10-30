import { z } from 'zod';

/**
 * Modelo de identidad de 3B (ver Playbook + condiciones del equipo):
 *
 * - Una identidad global por usuario.
 * - **Todo usuario registrado es Maker** (capacidad base, implícita; no es un rol).
 * - **Seller** y **Mover** son *capacidades adicionales*, no roles globales:
 *   - Seller se obtiene vía **membresías de tienda** (`StoreRole`).
 *   - Mover se obtiene vía un **perfil de Mover** aprobado.
 * - La administración de comunidad está **acotada a su comunidad** (`CommunityRole`).
 * - Los permisos globales se reservan al **administrador de plataforma**
 *   (`platformAdmin`, bandera global, no un rol más).
 */

/** Rol de un usuario DENTRO de una comunidad (membresía con alcance). */
export const CommunityRole = z.enum(['member', 'moderator', 'admin']);
export type CommunityRole = z.infer<typeof CommunityRole>;

/** Rol de un miembro DENTRO de una tienda (capacidad de Seller, con alcance). */
export const StoreRole = z.enum(['owner', 'admin', 'catalog', 'sales']);
export type StoreRole = z.infer<typeof StoreRole>;

/** Estado de una membresía (comunidad o tienda). */
export const MembershipStatus = z.enum(['active', 'suspended', 'pending']);
export type MembershipStatus = z.infer<typeof MembershipStatus>;

/**
 * Capacidades resueltas de un usuario en un contexto dado. Se calcula en el
 * backend a partir de membresías/perfil; **nunca** se confía en lo que envía
 * el cliente.
 */
export const Capabilities = z.object({
  isMaker: z.literal(true), // siempre: todo usuario es Maker
  isSeller: z.boolean(), // tiene al menos una membresía de tienda activa
  isMover: z.boolean(), // tiene perfil de Mover aprobado
  isPlatformAdmin: z.boolean(), // bandera global reservada
});
export type Capabilities = z.infer<typeof Capabilities>;

/** Comunidad a la que pertenece el usuario (con su rol de alcance). */
export const MeCommunity = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  role: CommunityRole,
});
export type MeCommunity = z.infer<typeof MeCommunity>;

/** Tienda en la que el usuario es miembro (capacidad Seller, con su rol). */
export const MeStore = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  role: StoreRole,
});
export type MeStore = z.infer<typeof MeStore>;

/** Respuesta de `/v1/me`: identidad + capacidades resueltas + alcances. */
export const MeResponse = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
  }),
  capabilities: Capabilities,
  communities: z.array(MeCommunity),
  stores: z.array(MeStore),
});
export type MeResponse = z.infer<typeof MeResponse>;
