import type { MediaMime, UploadTarget } from '@3b/contracts';

/**
 * Abstracción del storage de archivos. La implementación concreta (disco local
 * en dev, R2 en prod) se **inyecta** desde `apps/api`; el módulo `media` solo
 * conoce esta interfaz, así core no depende de node (fs/crypto) ni de la nube.
 */
export interface MediaStorage {
  /** Devuelve a dónde y cómo subir el objeto (fase 2 de la subida). */
  signUpload(input: { key: string; mime: string }): UploadTarget;
  /** URL pública para servir el objeto ya subido. */
  publicUrl(key: string): string;
}

/** Extensión de archivo para cada MIME aceptado. */
const EXT_BY_MIME: Record<MediaMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
};

const MIME_BY_EXT: Record<string, MediaMime> = Object.fromEntries(
  Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime as MediaMime]),
) as Record<string, MediaMime>;

/** Extensión (sin punto) para un MIME. */
export function extForMime(mime: MediaMime): string {
  return EXT_BY_MIME[mime];
}

/** MIME para una extensión de archivo (o null si no se reconoce). */
export function mimeForExt(ext: string): MediaMime | null {
  return MIME_BY_EXT[ext.toLowerCase()] ?? null;
}
