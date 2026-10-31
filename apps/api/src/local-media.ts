import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { MediaStorage } from '@3b/core/modules/media';
import { mimeForExt } from '@3b/core/modules/media';
import { Hono } from 'hono';

/**
 * Storage de media para DESARROLLO: disco local + URLs firmadas (HMAC),
 * espejando el flujo de subida directa de R2 (dos fases). En producción esto se
 * reemplaza por un storage R2 que implemente la misma interfaz `MediaStorage`.
 *
 * - `signUpload` firma un token corto `{key, mime, exp}` y devuelve un PUT a
 *   `/media-local/upload/:token`.
 * - El archivo se sirve público en `/media-local/file/:key` (bucket de dev).
 */

interface LocalMediaConfig {
  /** Carpeta en disco donde se guardan los objetos. */
  dir: string;
  /** Secreto para firmar los tokens de subida. */
  secret: string;
  /** Base pública de la API (para construir las URLs). */
  publicUrl: string;
}

const UPLOAD_TTL_MS = 10 * 60 * 1000; // 10 min

const b64url = (buf: Buffer | string) =>
  (typeof buf === 'string' ? Buffer.from(buf) : buf).toString('base64url');

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Crea el storage local (implementa la interfaz que consume el módulo media). */
export function createLocalMediaStorage(cfg: LocalMediaConfig): MediaStorage {
  return {
    signUpload({ key, mime }) {
      const exp = Date.now() + UPLOAD_TTL_MS;
      const payload = b64url(JSON.stringify({ key, mime, exp }));
      const token = `${payload}.${sign(cfg.secret, payload)}`;
      return {
        url: `${cfg.publicUrl}/media-local/upload/${token}`,
        method: 'PUT',
        headers: { 'Content-Type': mime },
        expiresAt: new Date(exp).toISOString(),
      };
    },
    publicUrl(key) {
      return `${cfg.publicUrl}/media-local/file/${key}`;
    },
  };
}

/** Verifica un token de subida y devuelve su payload, o null si es inválido. */
function verifyToken(
  secret: string,
  token: string,
): { key: string; mime: string } | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = sign(secret, payload);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { key, mime, exp } = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    if (typeof key !== 'string' || typeof mime !== 'string') return null;
    if (typeof exp !== 'number' || exp < Date.now()) return null;
    return { key, mime };
  } catch {
    return null;
  }
}

/** Resuelve la ruta en disco de una key, abortando si se sale de `dir`. */
function safePath(dir: string, key: string): string | null {
  const base = resolve(dir);
  const full = resolve(base, key);
  if (full !== base && !full.startsWith(base + sep)) return null;
  return full;
}

/**
 * Router de las rutas de archivos locales. Se monta FUERA de `/v1` (sin sesión):
 * la subida se autentica por el token firmado; la lectura es pública (dev).
 */
export function localMediaRouter(cfg: LocalMediaConfig) {
  const app = new Hono();

  // Fase 2: subir los bytes al destino firmado.
  app.put('/upload/:token', async (c) => {
    const payload = verifyToken(cfg.secret, c.req.param('token'));
    if (!payload) return c.json({ error: 'Token inválido o vencido.' }, 403);
    const full = safePath(cfg.dir, payload.key);
    if (!full) return c.json({ error: 'Key inválida.' }, 400);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, Buffer.from(await c.req.arrayBuffer()));
    return c.body(null, 204);
  });

  // Servir un archivo por su key (bucket público de dev).
  app.get('/file/:key{.+}', async (c) => {
    const key = c.req.param('key');
    const full = safePath(cfg.dir, key);
    if (!full) return c.json({ error: 'Key inválida.' }, 400);
    const ext = key.slice(key.lastIndexOf('.') + 1);
    const mime = mimeForExt(ext) ?? 'application/octet-stream';
    try {
      const data = await readFile(full);
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch {
      return c.json({ error: 'No encontrado.' }, 404);
    }
  });

  return app;
}
