import type { createApiApp } from '../../../src/app';

type ApiApp = ReturnType<typeof createApiApp>['app'];

/** Contraseña de dev de los usuarios del seed (ver `@3b/auth/seed-credentials`). */
export const DEV_PASSWORD = 'Password123!';

/** Emails de los usuarios del seed determinista. */
export const SEED = {
  admin: 'admin@3b.test',
  ana: 'ana@3b.test',
  carlos: 'carlos@3b.test',
  marta: 'marta@3b.test',
  pedro: 'pedro@3b.test',
  lucia: 'lucia@3b.test',
} as const;

/** UUIDs deterministas del seed (coinciden con los de core/test/integration). */
export const IDS = {
  admin: '22222222-2222-2222-2222-222222222201',
  ana: '22222222-2222-2222-2222-222222222202',
  carlos: '22222222-2222-2222-2222-222222222203',
  marta: '22222222-2222-2222-2222-222222222204',
  pedro: '22222222-2222-2222-2222-222222222205',
  lucia: '22222222-2222-2222-2222-222222222206',
} as const;

/**
 * Cliente de test con "cookie jar": ejecuta requests contra la app in-process,
 * acumula las cookies de `Set-Cookie` (sesión de Better Auth, impersonación) y las
 * reenvía en los siguientes requests — como lo haría un navegador.
 */
export function createTestClient(app: ApiApp) {
  const jar = new Map<string, string>();

  function cookieHeader(): string {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  function absorb(res: Response): void {
    // Node/undici: getSetCookie() devuelve TODAS las cabeceras Set-Cookie.
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const raw of setCookies) {
      const first = raw.split(';', 1)[0] ?? '';
      const eq = first.indexOf('=');
      if (eq === -1) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      // valor vacío ⇒ cookie borrada (logout / fin de impersonación).
      if (value === '') jar.delete(name);
      else jar.set(name, value);
    }
  }

  async function request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = cookieHeader();
    if (cookie) headers.set('cookie', cookie);
    const res = await app.request(path, { ...init, headers });
    absorb(res);
    return res;
  }

  /** Inicia sesión por email/password (Better Auth) y guarda la cookie de sesión. */
  async function signIn(email: string, password = DEV_PASSWORD): Promise<void> {
    const res = await request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new Error(
        `sign-in ${email} falló: ${res.status} ${await res.text()}`,
      );
    }
  }

  function clearCookies(): void {
    jar.clear();
  }

  return { request, signIn, clearCookies, cookieHeader };
}

/** Atajo: crea un cliente, inicia sesión con `email` y lo devuelve autenticado. */
export async function signedInClient(app: ApiApp, email: string) {
  const client = createTestClient(app);
  await client.signIn(email);
  return client;
}
