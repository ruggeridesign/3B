import { auth } from '@3b/auth';
import { loadEnv } from '@3b/config';
import { type ApiVariables, dbErrorResponse } from '@3b/core/http';
import { adminRouter, IMPERSONATE_COOKIE } from '@3b/core/modules/admin';
import { meRouter, readIsPlatformAdmin } from '@3b/core/modules/identity';
import { storeRouter } from '@3b/core/modules/store';
import { systemRouter } from '@3b/core/modules/system';
import { createAppDb, sql, withAppContext } from '@3b/db';
import { serve } from '@hono/node-server';
import { OpenAPIHono } from '@hono/zod-openapi';
import { getCookie } from 'hono/cookie';

const env = loadEnv();
// Conexión con el rol `app` (mínimo privilegio, sujeto a RLS) para el runtime.
const appDb = createAppDb(env.APP_DATABASE_URL);

const app = new OpenAPIHono<{ Variables: ApiVariables }>();

app.get('/', (c) => c.json({ name: '3b-api', ok: true }));

// Better Auth: resuelve /api/auth/** (registro, login, sesión, OAuth…).
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Middleware de auth/contexto para /v1/**: lee la sesión (servidor), abre una
// transacción con contexto RLS y resuelve la capacidad global de plataforma.
// Nunca confía en identificadores enviados por el cliente.
app.use('/v1/*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    c.set('userId', null);
    c.set('db', null);
    c.set('isPlatformAdmin', false);
    c.set('realUserId', null);
    c.set('realIsPlatformAdmin', false);
    c.set('impersonatedBy', null);
    return next();
  }
  const realUserId = session.user.id;
  return withAppContext(appDb.db, { userId: realUserId }, async (tx) => {
    const realIsAdmin = await readIsPlatformAdmin(tx, realUserId);

    // "Ver como": si hay cookie de impersonación y el usuario REAL es admin de
    // plataforma, el usuario EFECTIVO pasa a ser el objetivo (contexto RLS).
    const target = getCookie(c, IMPERSONATE_COOKIE);
    let effectiveUserId = realUserId;
    let impersonatedBy: ApiVariables['impersonatedBy'] = null;
    if (target && realIsAdmin && target !== realUserId) {
      effectiveUserId = target;
      impersonatedBy = { id: realUserId, email: session.user.email };
      await tx.execute(sql`select set_config('app.user_id', ${target}, true)`);
    }
    const effIsAdmin = impersonatedBy
      ? await readIsPlatformAdmin(tx, effectiveUserId)
      : realIsAdmin;

    c.set('realUserId', realUserId);
    c.set('realIsPlatformAdmin', realIsAdmin);
    c.set('userId', effectiveUserId);
    c.set('isPlatformAdmin', effIsAdmin);
    c.set('impersonatedBy', impersonatedBy);
    c.set('db', tx);
    await next();
  });
});

// Routers http de los módulos de core bajo /v1.
app.route('/v1', systemRouter());
app.route('/v1', meRouter());
app.route('/v1', adminRouter());
app.route('/v1', storeRouter());

// Documento OpenAPI (contrato de la API).
app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: '3B API', version: '0.0.0' },
});

// UI de documentación (Scalar vía CDN, sin dependencia npm).
app.get('/docs', (c) =>
  c.html(
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>3B API · Docs</title></head><body>' +
      '<script id="api-reference" data-url="/openapi.json"></script>' +
      '<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>' +
      '</body></html>',
  ),
);

// Manejo central de errores: traduce errores de Postgres (RLS, únicos, FK…) a
// respuestas HTTP coherentes. Ver `@3b/core/http` → dbErrorResponse.
app.onError((err, c) => {
  const mapped = dbErrorResponse(err);
  if (mapped) return c.json({ error: mapped.error }, mapped.status);
  console.error('[3b-api] error no manejado:', err);
  return c.json({ error: 'Error interno' }, 500);
});

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`[3b-api] http://localhost:${info.port}  (docs: /docs)`);
});
