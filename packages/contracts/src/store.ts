import { z } from 'zod';
import { StoreRole } from './identity';

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

/** Nivel de verificación (KYC) de la tienda: lo fija el trigger al aprobar. */
export const StoreVerificationLevel = z.enum(['none', 'verified']);
export type StoreVerificationLevel = z.infer<typeof StoreVerificationLevel>;

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
  verificationLevel: StoreVerificationLevel,
  createdAt: z.string(),
});
export type Store = z.infer<typeof Store>;

/** Lista de tiendas (p. ej. las del usuario). */
export const StoreList = z.object({ stores: z.array(Store) });
export type StoreList = z.infer<typeof StoreList>;

/**
 * Roles que se pueden ASIGNAR a un miembro desde la API (equipo de la tienda).
 * Excluye `owner`: la titularidad la fija el trigger de alta y transferirla es
 * un flujo aparte. Ver `StoreRole` (conjunto completo) en `./identity`.
 */
export const AssignableStoreRole = z.enum(['admin', 'catalog', 'sales']);
export type AssignableStoreRole = z.infer<typeof AssignableStoreRole>;

/** Un miembro del equipo de la tienda, con los datos visibles del usuario. */
export const StoreMember = z.object({
  userId: z.string(),
  // name/email pueden faltar si la RLS oculta ese usuario (no comparte
  // comunidad con quien consulta); el rol siempre se ve.
  name: z.string().nullable(),
  email: z.string().nullable(),
  role: StoreRole,
  createdAt: z.string(),
});
export type StoreMember = z.infer<typeof StoreMember>;

/** Equipo completo de una tienda. */
export const StoreMemberList = z.object({ members: z.array(StoreMember) });
export type StoreMemberList = z.infer<typeof StoreMemberList>;

/** Invitar a alguien al equipo por email (debe compartir una comunidad). */
export const InviteStoreMemberInput = z.object({
  email: z.string().email(),
  role: AssignableStoreRole,
});
export type InviteStoreMemberInput = z.infer<typeof InviteStoreMemberInput>;

/** Cambiar el rol de un miembro existente. */
export const UpdateStoreMemberInput = z.object({ role: AssignableStoreRole });
export type UpdateStoreMemberInput = z.infer<typeof UpdateStoreMemberInput>;

// ===== Métodos de pago =====

/** Medio por el que la tienda recibe pagos (contexto Venezuela). */
export const PaymentMethodType = z.enum([
  'pago_movil',
  'transferencia',
  'zelle',
  'binance',
  'efectivo',
  'otro',
]);
export type PaymentMethodType = z.infer<typeof PaymentMethodType>;

/**
 * Detalles del método de pago: mapa flexible de campos según el tipo (p. ej.
 * `{ telefono, banco, cedula }` para pago móvil, `{ email }` para Zelle). Se
 * guardan **cifrados en reposo**. La validación por tipo llegará más adelante.
 */
export const PaymentMethodDetails = z.record(z.string(), z.string());
export type PaymentMethodDetails = z.infer<typeof PaymentMethodDetails>;

/** Representación de un método de pago (los detalles van descifrados al dueño). */
export const PaymentMethod = z.object({
  id: z.string(),
  storeId: z.string(),
  type: PaymentMethodType,
  details: PaymentMethodDetails,
  active: z.boolean(),
  createdAt: z.string(),
});
export type PaymentMethod = z.infer<typeof PaymentMethod>;

/** Lista de métodos de pago de una tienda. */
export const PaymentMethodList = z.object({
  paymentMethods: z.array(PaymentMethod),
});
export type PaymentMethodList = z.infer<typeof PaymentMethodList>;

/** Alta de un método de pago. */
export const CreatePaymentMethodInput = z.object({
  type: PaymentMethodType,
  details: PaymentMethodDetails,
  active: z.boolean().optional(),
});
export type CreatePaymentMethodInput = z.infer<typeof CreatePaymentMethodInput>;

/** Edición parcial: cambiar detalles y/o activar/desactivar. */
export const UpdatePaymentMethodInput = z.object({
  details: PaymentMethodDetails.optional(),
  active: z.boolean().optional(),
});
export type UpdatePaymentMethodInput = z.infer<typeof UpdatePaymentMethodInput>;

// ===== Horarios (disponibilidad semanal) =====

/** Día de la semana: 0 = domingo … 6 = sábado (convención de `Date.getDay`). */
export const Weekday = z.number().int().min(0).max(6);
export type Weekday = z.infer<typeof Weekday>;

/**
 * Minuto del día (0 = 00:00 … 1440 = 24:00). Se guarda como entero para comparar
 * y validar fácil; la web lo formatea a `HH:MM`. No es dinero, así que va como
 * número (igual criterio que `durationMin`).
 */
export const MinutesOfDay = z.number().int().min(0).max(1440);

/**
 * Un intervalo de apertura de la tienda en un día de la semana. Una tienda puede
 * tener varios intervalos por día (turno partido); un día sin intervalos = cerrado.
 */
export const StoreHour = z.object({
  id: z.string(),
  storeId: z.string(),
  weekday: Weekday,
  opensMin: MinutesOfDay,
  closesMin: MinutesOfDay,
  createdAt: z.string(),
});
export type StoreHour = z.infer<typeof StoreHour>;

/** Lista de intervalos de horario de una tienda. */
export const StoreHourList = z.object({ hours: z.array(StoreHour) });
export type StoreHourList = z.infer<typeof StoreHourList>;

/** Alta de un intervalo. El cierre debe ser posterior a la apertura. */
export const CreateStoreHourInput = z
  .object({
    weekday: Weekday,
    opensMin: MinutesOfDay,
    closesMin: MinutesOfDay,
  })
  .refine((d) => d.closesMin > d.opensMin, {
    message: 'El cierre debe ser posterior a la apertura.',
    path: ['closesMin'],
  });
export type CreateStoreHourInput = z.infer<typeof CreateStoreHourInput>;
