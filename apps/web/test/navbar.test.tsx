import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Navbar } from '../app/_components/navbar';
import {
  communityAdmin,
  impersonatingMover,
  makerOnly,
  mover,
  platformAdmin,
  seller,
} from './fixtures/me';

// El navbar depende de hooks de Next y de módulos cliente: los mockeamos para
// renderizarlo aislado en jsdom. `VerComo` se stubea (su fetch se prueba aparte).
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../app/_components/cart-provider', () => ({
  useCart: () => ({ count: 0 }),
  CartProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../app/_components/ver-como', () => ({
  VerComo: () => <button type="button">Ver como</button>,
}));

vi.mock('../lib/auth-client', () => ({ signOut: vi.fn() }));

describe('Navbar — espacios visibles según el usuario', () => {
  const cases = [
    {
      rol: 'Maker',
      me: makerOnly,
      visibles: ['Comprar'],
      ocultos: ['Mi Tienda', 'Mover', 'Comunidad', 'Admin'],
      verComo: false,
    },
    {
      rol: 'Seller',
      me: seller,
      visibles: ['Comprar', 'Mi Tienda'],
      ocultos: ['Mover', 'Comunidad', 'Admin'],
      verComo: false,
    },
    {
      rol: 'Mover',
      me: mover,
      visibles: ['Comprar', 'Mover'],
      ocultos: ['Mi Tienda', 'Comunidad', 'Admin'],
      verComo: false,
    },
    {
      rol: 'Admin de Comunidad',
      me: communityAdmin,
      visibles: ['Comprar', 'Comunidad'],
      ocultos: ['Mi Tienda', 'Mover', 'Admin'],
      verComo: false,
    },
    {
      rol: 'Admin de Plataforma',
      me: platformAdmin,
      visibles: ['Comprar', 'Admin'],
      ocultos: ['Mi Tienda', 'Mover', 'Comunidad'],
      verComo: true,
    },
  ] as const;

  it.each(cases)(
    '$rol ve exactamente sus espacios',
    ({ me, visibles, ocultos, verComo }) => {
      render(<Navbar me={me} />);
      for (const label of visibles) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
      for (const label of ocultos) {
        expect(screen.queryByText(label)).toBeNull();
      }
      const verComoBtn = screen.queryByRole('button', { name: 'Ver como' });
      if (verComo) expect(verComoBtn).toBeInTheDocument();
      else expect(verComoBtn).toBeNull();
    },
  );

  it('un admin REAL impersonando a otro usuario sigue viendo "Ver como"', () => {
    render(<Navbar me={impersonatingMover} />);
    expect(
      screen.getByRole('button', { name: 'Ver como' }),
    ).toBeInTheDocument();
  });
});
