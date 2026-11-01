import { z } from 'zod';
import { Uuid } from './store';

/**
 * Contratos del módulo `media` (archivos/imágenes). Núcleo transversal: lo
 * consumen tiendas, ítems, KYC, mensajes, etc. La subida es en **dos fases**:
 * se crea una fila `pending` + una URL de subida firmada, el cliente sube el
 * archivo directo al storage y luego confirma (`ready`).
 */

/**
 * A qué entidad pertenece el archivo (polimórfico). Se extiende a medida que
 * aparecen consumidores (item, kyc, message…). Hoy: tienda o usuario.
 */
export const MediaOwnerType = z.enum(['store', 'user', 'item']);
export type MediaOwnerType = z.infer<typeof MediaOwnerType>;

/** Estado del ciclo de vida de subida. */
export const MediaStatus = z.enum(['pending', 'ready']);
export type MediaStatus = z.infer<typeof MediaStatus>;

/** Tipos MIME aceptados (imágenes + PDF para documentos de KYC). */
export const MediaMime = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'application/pdf',
]);
export type MediaMime = z.infer<typeof MediaMime>;

/** Representación pública de un archivo. `url` sirve el contenido. */
export const Media = z.object({
  id: z.string(),
  ownerType: MediaOwnerType,
  ownerId: z.string(),
  mime: MediaMime,
  status: MediaStatus,
  url: z.string(),
  createdAt: z.string(),
});
export type Media = z.infer<typeof Media>;

/** Lista de archivos de un propietario. */
export const MediaList = z.object({ media: z.array(Media) });
export type MediaList = z.infer<typeof MediaList>;

/** Pedido de subida: a quién pertenece y qué tipo de archivo es. */
export const CreateMediaInput = z.object({
  ownerType: MediaOwnerType,
  ownerId: Uuid,
  mime: MediaMime,
});
export type CreateMediaInput = z.infer<typeof CreateMediaInput>;

/** Destino firmado al que el cliente sube el archivo (fase 2). */
export const UploadTarget = z.object({
  url: z.string(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string(),
});
export type UploadTarget = z.infer<typeof UploadTarget>;

/** Respuesta al crear una subida: la fila `pending` + a dónde subir. */
export const CreateMediaResponse = z.object({
  media: Media,
  upload: UploadTarget,
});
export type CreateMediaResponse = z.infer<typeof CreateMediaResponse>;
