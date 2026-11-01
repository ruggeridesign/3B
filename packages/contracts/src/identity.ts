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
/** Si el superadmin está "viendo como" otro usuario, quién lo impersona. */
export const Impersonation = z.object({
  byUserId: z.string(),
  byEmail: z.string(),
});
export type Impersonation = z.infer<typeof Impersonation>;

export const MeResponse = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
  }),
  capabilities: Capabilities,
  communities: z.array(MeCommunity),
  stores: z.array(MeStore),
  // null salvo que un admin esté impersonando a este usuario ("Ver como").
  impersonating: Impersonation.nullable(),
});
export type MeResponse = z.infer<typeof MeResponse>;

// ===== Verificación (KYC) =====

/** A qué sujeto pertenece la verificación (polimórfico). M2 usa `store`. */
export const KycSubjectType = z.enum(['store', 'mover']);
export type KycSubjectType = z.infer<typeof KycSubjectType>;

/** Tipo de documento presentado (contexto Venezuela). */
export const KycDocType = z.enum(['rif', 'cedula', 'pasaporte', 'other']);
export type KycDocType = z.infer<typeof KycDocType>;

/** Estado de una verificación: nace `pending`, el revisor decide. */
export const KycStatus = z.enum(['pending', 'approved', 'rejected']);
export type KycStatus = z.infer<typeof KycStatus>;

/** Una verificación KYC (datos y archivos sensibles). */
export const KycSubmission = z.object({
  id: z.string(),
  subjectType: KycSubjectType,
  subjectId: z.string(),
  docType: KycDocType,
  // Documento subido (media, polimórfica). Puede faltar hasta adjuntarlo.
  mediaId: z.string().nullable(),
  status: KycStatus,
  reviewerId: z.string().nullable(),
  reviewNotes: z.string().nullable(),
  expiresAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type KycSubmission = z.infer<typeof KycSubmission>;

/** Lista de verificaciones (p. ej. las de una tienda o la cola de una comunidad). */
export const KycSubmissionList = z.object({
  submissions: z.array(KycSubmission),
});
export type KycSubmissionList = z.infer<typeof KycSubmissionList>;

/** Alta de una verificación. El sujeto sale de la ruta; el estado nace `pending`. */
export const CreateKycSubmissionInput = z.object({
  docType: KycDocType,
  mediaId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .nullable()
    .optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type CreateKycSubmissionInput = z.infer<typeof CreateKycSubmissionInput>;

/** Decisión del revisor (admin de la comunidad del sujeto). */
export const ReviewKycInput = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().max(2000).nullable().optional(),
});
export type ReviewKycInput = z.infer<typeof ReviewKycInput>;
