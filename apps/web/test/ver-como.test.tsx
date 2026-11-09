import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickRep, VerComo } from '../app/_components/ver-como';
import { platformAdmin } from './fixtures/me';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Lista de usuarios + capacidades (lo que devuelve /v1/admin/users).
type Users = Parameters<typeof pickRep>[0];
const USERS: Users = [
  {
    id: 'admin',
    email: 'admin@3b.test',
    name: 'Admin',
    isPlatformAdmin: true,
    isSeller: false,
    isMover: false,
    isCommunityAdmin: false,
  },
  {
    id: 'ana',
    email: 'ana@3b.test',
    name: 'Ana',
    isPlatformAdmin: false,
    isSeller: false,
    isMover: false,
    isCommunityAdmin: true,
  },
  {
    id: 'carlos',
    email: 'carlos@3b.test',
    name: 'Carlos',
    isPlatformAdmin: false,
    isSeller: true,
    isMover: false,
    isCommunityAdmin: false,
  },
  {
    id: 'pedro',
    email: 'pedro@3b.test',
    name: 'Pedro',
    isPlatformAdmin: false,
    isSeller: false,
    isMover: true,
    isCommunityAdmin: false,
  },
  {
    id: 'lucia',
    email: 'lucia@3b.test',
    name: 'Lucía',
    isPlatformAdmin: false,
    isSeller: false,
    isMover: false,
    isCommunityAdmin: false,
  },
];

describe('pickRep — elige el representante correcto por rol', () => {
  it('seller → primer Seller no-admin (Carlos)', () => {
    expect(pickRep(USERS, 'seller')?.id).toBe('carlos');
  });
  it('mover → Mover aprobado (Pedro)', () => {
    expect(pickRep(USERS, 'mover')?.id).toBe('pedro');
  });
  it('community → admin de comunidad (Ana)', () => {
    expect(pickRep(USERS, 'community')?.id).toBe('ana');
  });
  it('maker → usuario solo-Maker (Lucía), no un admin ni otro rol', () => {
    expect(pickRep(USERS, 'maker')?.id).toBe('lucia');
  });
  it('nunca elige a un admin de plataforma', () => {
    for (const role of ['seller', 'mover', 'community', 'maker'] as const) {
      expect(pickRep(USERS, role)?.isPlatformAdmin).not.toBe(true);
    }
  });
  it('maker: si no hay solo-Maker, cae a cualquier no-admin', () => {
    const rep = pickRep(
      USERS.filter((u) => u.id !== 'lucia'),
      'maker',
    );
    expect(rep?.isPlatformAdmin).toBe(false);
  });
});

describe('VerComo — carga de roles al montar', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ users: USERS }),
    }) as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it('pide /v1/admin/users al montar y muestra el botón "Ver como"', async () => {
    render(<VerComo me={platformAdmin} />);
    expect(
      screen.getByRole('button', { name: 'Ver como' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/v1/admin/users'),
    );
  });
});
