import type { MeResponse } from '@3b/contracts';

/**
 * Fixtures de `/v1/me` por rol, para testear qué interfaz ve cada tipo de usuario
 * (navbar, "Ver como"). Coinciden con las capacidades del seed determinista.
 */

const member = (slug: string, name: string) => ({
  id: `comm-${slug}`,
  slug,
  name,
  role: 'member' as const,
});

const base = (over: Partial<MeResponse>): MeResponse => ({
  user: { id: 'u-test', email: 'test@3b.test', name: 'Test' },
  capabilities: {
    isMaker: true,
    isSeller: false,
    isMover: false,
    isPlatformAdmin: false,
  },
  communities: [member('coro', 'Coro')],
  stores: [],
  impersonating: null,
  ...over,
});

/** Lucía: solo Maker (comprador). */
export const makerOnly = base({
  user: { id: 'u-lucia', email: 'lucia@3b.test', name: 'Lucía' },
});

/** Carlos: Seller (tiene tiendas). */
export const seller = base({
  user: { id: 'u-carlos', email: 'carlos@3b.test', name: 'Carlos' },
  capabilities: {
    isMaker: true,
    isSeller: true,
    isMover: false,
    isPlatformAdmin: false,
  },
  stores: [
    { id: 's-fe', slug: 'ferreteria', name: 'Ferretería', role: 'owner' },
  ],
});

/** Pedro: Mover (perfil aprobado). */
export const mover = base({
  user: { id: 'u-pedro', email: 'pedro@3b.test', name: 'Pedro' },
  capabilities: {
    isMaker: true,
    isSeller: false,
    isMover: true,
    isPlatformAdmin: false,
  },
  communities: [member('punto-fijo', 'Punto Fijo')],
});

/** Ana: admin de comunidad. */
export const communityAdmin = base({
  user: { id: 'u-ana', email: 'ana@3b.test', name: 'Ana' },
  communities: [{ id: 'comm-coro', slug: 'coro', name: 'Coro', role: 'admin' }],
});

/** Admin de plataforma. */
export const platformAdmin = base({
  user: { id: 'u-admin', email: 'admin@3b.test', name: 'Admin Plataforma' },
  capabilities: {
    isMaker: true,
    isSeller: false,
    isMover: false,
    isPlatformAdmin: true,
  },
});

/** Admin REAL impersonando a un Mover (capacidad efectiva sin admin). */
export const impersonatingMover = base({
  user: { id: 'u-pedro', email: 'pedro@3b.test', name: 'Pedro' },
  capabilities: {
    isMaker: true,
    isSeller: false,
    isMover: true,
    isPlatformAdmin: false,
  },
  communities: [member('punto-fijo', 'Punto Fijo')],
  impersonating: { byUserId: 'u-admin', byEmail: 'admin@3b.test' },
});
