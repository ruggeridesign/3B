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
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Usuario + capacidades que devuelve `/v1/admin/users` (solo admin de plataforma). */
interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
  isSeller: boolean;
  isMover: boolean;
  isCommunityAdmin: boolean;
}

type RoleKey = 'maker' | 'seller' | 'mover' | 'community';

const ROLES: { key: RoleKey; label: string; hint: string }[] = [
  { key: 'maker', label: 'Comprar', hint: 'como Maker (comprador)' },
  { key: 'seller', label: 'Mi Tienda', hint: 'como Seller (vendedor)' },
  { key: 'mover', label: 'Mover', hint: 'como repartidor' },
  { key: 'community', label: 'Comunidad', hint: 'como admin de comunidad' },
];

/**
 * Elige un usuario REPRESENTATIVO para un rol, para que el admin vea esa interfaz
 * sin tener que elegir usuarios a mano. Nunca impersona a otro admin de plataforma.
 * Para "Maker" prefiere un usuario que sea SOLO Maker (experiencia limpia de compra).
 */
export function pickRep(
  users: AdminUser[],
  role: RoleKey,
): AdminUser | undefined {
  const notAdmin = (u: AdminUser) => !u.isPlatformAdmin;
  if (role === 'seller') return users.find((u) => notAdmin(u) && u.isSeller);
  if (role === 'mover') return users.find((u) => notAdmin(u) && u.isMover);
  if (role === 'community')
    return users.find((u) => notAdmin(u) && u.isCommunityAdmin);
  // maker: alguien sin otras capacidades; si no hay, cualquier no-admin.
  return (
    users.find(
      (u) => notAdmin(u) && !u.isSeller && !u.isMover && !u.isCommunityAdmin,
    ) ?? users.find(notAdmin)
  );
}

/**
 * "Ver como" (solo admin de plataforma): cambia la app a la INTERFAZ de un rol
 * (Maker / Seller / Mover / admin de Comunidad) impersonando a un usuario
 * representativo de ese rol, o vuelve a la propia cuenta de admin. Permanece
 * visible mientras se impersona para poder saltar entre roles.
 */
export function VerComo({ me }: { me: MeResponse }) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [busy, setBusy] = useState(false);

  const impersonating = me.impersonating != null;
  const currentId = me.user.id; // efectivo: el usuario que se está viendo

  // Carga los usuarios + capacidades al montar (lista chica; solo la ve el admin).
  useEffect(() => {
    let alive = true;
    fetch('/v1/admin/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { users: AdminUser[] } | null) => {
        if (alive && data) setUsers(data.users);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // `router.refresh()` es un refresh "suave": NO desmonta este client component,
  // así que hay que resetear `busy` a mano (si no, queda deshabilitado para siempre
  // tras el primer cambio y no se puede volver a saltar de rol).
  async function impersonate(userId: string) {
    if (busy || userId === currentId) return;
    setBusy(true);
    try {
      await fetch('/v1/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function back() {
    if (busy || !impersonating) return;
    setBusy(true);
    try {
      await fetch('/v1/admin/impersonate', { method: 'DELETE' });
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={impersonating ? 'secondary' : 'outline'} size="sm">
          Ver como
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Ver la app como…</DropdownMenuLabel>
        {!users && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            Cargando…
          </div>
        )}
        {users &&
          ROLES.map((r) => {
            const rep = pickRep(users, r.key);
            const active = impersonating && rep?.id === currentId;
            return (
              <DropdownMenuItem
                key={r.key}
                disabled={!rep || busy || active}
                onClick={() => rep && impersonate(rep.id)}
                className="flex flex-col items-start gap-0"
              >
                <span className="font-medium">
                  {r.label}
                  {active ? ' · actual' : ''}
                </span>
                <span className="text-xs text-muted-foreground">
                  {rep ? `${r.hint} · ${rep.name ?? rep.email}` : 'sin ejemplo'}
                </span>
              </DropdownMenuItem>
            );
          })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy || !impersonating}
          onClick={back}
          className="flex flex-col items-start gap-0"
        >
          <span className="font-medium">
            Admin{!impersonating ? ' · actual' : ''}
          </span>
          <span className="text-xs text-muted-foreground">
            volver a tu cuenta
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
