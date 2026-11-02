'use client';

import type { MeResponse } from '@3b/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@3b/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '../../lib/auth-client';
import { useCart } from './cart-provider';
import { VerComo } from './ver-como';

/** Enlace al carrito con el contador de ítems (solo Makers). */
function CartLink() {
  const { count } = useCart();
  return (
    <Link href="/comprar/carrito">
      <Button variant="ghost" size="sm">
        Carrito{count > 0 ? ` (${count})` : ''}
      </Button>
    </Link>
  );
}

export function Navbar({ me }: { me: MeResponse }) {
  const pathname = usePathname();
  const router = useRouter();

  const spaces = [
    { href: '/comprar', label: 'Comprar', show: me.capabilities.isMaker },
    { href: '/mi-tienda', label: 'Mi Tienda', show: me.capabilities.isSeller },
    { href: '/mover', label: 'Mover', show: me.capabilities.isMover },
    { href: '/admin', label: 'Admin', show: me.capabilities.isPlatformAdmin },
  ].filter((s) => s.show);

  async function onLogout() {
    await signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="glass-bar sticky top-0 z-40 flex items-center gap-3 px-4 py-2.5">
      <Link href="/" className="font-bold text-foreground">
        3B
      </Link>

      {me.communities.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {me.communities[0]?.name ?? 'Comunidad'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Comunidad activa</DropdownMenuLabel>
            {me.communities.map((c) => (
              <DropdownMenuItem key={c.id}>{c.name}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <nav className="flex items-center gap-1">
        {spaces.map((s) => {
          const active =
            pathname === s.href || pathname.startsWith(`${s.href}/`);
          return (
            <Link key={s.href} href={s.href}>
              <Button variant={active ? 'secondary' : 'ghost'} size="sm">
                {s.label}
              </Button>
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {me.capabilities.isMaker && <CartLink />}
        {me.capabilities.isPlatformAdmin && <VerComo />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              {me.user.name ?? me.user.email}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{me.user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {me.capabilities.isMaker && (
              <DropdownMenuItem asChild>
                <Link href="/comprar/pedidos">Mis pedidos</Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href="/mi-tienda">
                {me.capabilities.isSeller ? 'Mi Tienda' : 'Abrir una tienda'}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
