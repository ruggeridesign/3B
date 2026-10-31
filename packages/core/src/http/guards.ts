import type { AppTransaction } from '@3b/db';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ApiEnv } from './types';

/**
 * Guards de autorización por CAPACIDAD, reutilizables en cualquier router http.
 *
 * Son middleware de Hono que leen el contexto ya resuelto por el middleware de
 * la API (sesión → contexto RLS → capacidades). Nunca confían en el cliente.
 * Para gatear por ALCANCE/propiedad (tienda, comunidad, Mover) usar los
 * predicados de `./authz` dentro del handler, con el recurso concreto.
 *
 * Errores: 401 (sin sesión) y 403 (sin la capacidad) con el shape `{ error }`,
 * coherente con el resto de la API. Declarar esas respuestas en `createRoute`.
 */

/** Requiere sesión: debe existir `db` y `userId` en el contexto. */
export const requireSession = createMiddleware<ApiEnv>(async (c, next) => {
  if (!c.get('db') || !c.get('userId')) {
    return c.json({ error: 'No autenticado' }, 401);
  }
  return next();
});

/** Requiere que el usuario EFECTIVO sea admin de plataforma. */
export const requirePlatformAdmin = createMiddleware<ApiEnv>(
  async (c, next) => {
    if (!c.get('db') || !c.get('userId')) {
      return c.json({ error: 'No autenticado' }, 401);
    }
    if (!c.get('isPlatformAdmin')) {
      return c.json({ error: 'Prohibido' }, 403);
    }
    return next();
  },
);

/**
 * Requiere que el usuario REAL (no el impersonado) sea admin de plataforma.
 * Para acciones sobre la propia impersonación (iniciar/terminar "Ver como"),
 * que deben seguir disponibles aun mientras se impersona a otro usuario.
 */
export const requireRealPlatformAdmin = createMiddleware<ApiEnv>(
  async (c, next) => {
    if (!c.get('db') || !c.get('realUserId')) {
      return c.json({ error: 'No autenticado' }, 401);
    }
    if (!c.get('realIsPlatformAdmin')) {
      return c.json({ error: 'Prohibido' }, 403);
    }
    return next();
  },
);

/**
 * Extrae el contexto EFECTIVO (db + userId) ya garantizado por `requireSession`
 * o por cualquier guard de capacidad. Estrecha los tipos nullable del contexto
 * a no-nulos para el handler. Si falta (guard ausente) es un error de
 * programación, no un caso de runtime.
 */
export function sessionCtx(c: Context<ApiEnv>): {
  db: AppTransaction;
  userId: string;
} {
  const db = c.get('db');
  const userId = c.get('userId');
  if (!db || !userId) {
    throw new Error('sessionCtx requiere un guard de sesión previo');
  }
  return { db, userId };
}

/**
 * Igual que `sessionCtx` pero con el usuario REAL de la sesión. Úsese tras
 * `requireRealPlatformAdmin`.
 */
export function realCtx(c: Context<ApiEnv>): {
  db: AppTransaction;
  realUserId: string;
} {
  const db = c.get('db');
  const realUserId = c.get('realUserId');
  if (!db || !realUserId) {
    throw new Error('realCtx requiere un guard de sesión previo');
  }
  return { db, realUserId };
}
