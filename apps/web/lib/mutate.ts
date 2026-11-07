// Helper de mutaciones del cliente (M8c). Centraliza los POST/PUT/PATCH/DELETE a /v1
// para dar feedback consistente offline: si no hay red, el service worker encola la
// request (Background Sync, ver app/sw.ts) y acá devolvemos 'queued' para avisar que
// se enviará al reconectar. Solo para uso en el navegador (fetch same-origin relativo
// + navigator); no llamar desde Server Components.

export type MutateOutcome<T = unknown> =
  | { status: 'ok'; data: T | null }
  | { status: 'queued' }
  | { status: 'error'; message: string };

export interface MutateInit {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Cuerpo JSON (se serializa). Omitir para requests sin cuerpo (ej. DELETE). */
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Envía una mutación a la API (same-origin `/v1/...`) y normaliza el resultado.
 * - `ok`: la API respondió 2xx (con el JSON parseado, o null).
 * - `queued`: no había red; el SW guardó la request para reenviarla al reconectar.
 * - `error`: la API respondió un estado de error, o el fetch falló estando online.
 */
export async function mutate<T = unknown>(
  path: string,
  init: MutateInit,
): Promise<MutateOutcome<T>> {
  const headers: Record<string, string> = {
    // Clave de idempotencia: viaja con la request encolada, así un reenvío puede
    // deduplicarse en el server (hoy solo lo honra la creación de pedidos; inocuo).
    'Idempotency-Key': crypto.randomUUID(),
    ...init.headers,
  };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }

  try {
    const res = await fetch(path, { method: init.method, headers, body });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as T | null;
      return { status: 'ok', data };
    }
    const err = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    return { status: 'error', message: err?.error ?? `Error ${res.status}` };
  } catch {
    // El fetch rechazó (sin respuesta). Si estamos offline, el SW ya encoló la
    // request para reenviarla al reconectar (Background Sync).
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { status: 'queued' };
    }
    return {
      status: 'error',
      message: 'No se pudo conectar. Intentá de nuevo.',
    };
  }
}
