'use client';

import type {
  AssignableStoreRole,
  StoreMember,
  StoreRole,
} from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

const fieldClass = cn(
  'h-9 rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

const ROLE_LABEL: Record<StoreRole, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  catalog: 'Catálogo',
  sales: 'Ventas',
};

const ASSIGNABLE: AssignableStoreRole[] = ['admin', 'catalog', 'sales'];

/** Equipo de la tienda. Los controles de gestión solo se muestran si `canManage`. */
export function StoreTeam({
  storeId,
  ownerId,
  members,
  canManage,
}: {
  storeId: string;
  ownerId: string;
  members: StoreMember[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Ejecuta una mutación contra la API y refresca; centraliza el manejo de error. */
  async function mutate(path: string, init: RequestInit) {
    setError(null);
    setBusy(true);
    const res = await fetch(`/v1/stores/${storeId}${path}`, init);
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return true;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo completar la acción.');
    return false;
  }

  function changeRole(userId: string, role: string) {
    return mutate(`/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
  }

  function removeMember(userId: string) {
    return mutate(`/members/${userId}`, { method: 'DELETE' });
  }

  return (
    <section className="space-y-4">
      <h2 className="font-medium text-foreground">Equipo</h2>

      <ul className="grid gap-2">
        {members.map((m) => {
          const isOwner = m.userId === ownerId;
          return (
            <li
              key={m.userId}
              className="glass flex items-center justify-between gap-3 rounded-lg p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {m.name ?? m.email ?? 'Usuario'}
                </p>
                {m.email && (
                  <p className="truncate text-muted-foreground text-sm">
                    {m.email}
                  </p>
                )}
              </div>

              {canManage && !isOwner ? (
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Rol"
                    className={fieldClass}
                    defaultValue={m.role}
                    disabled={busy}
                    onChange={(e) => changeRole(m.userId, e.target.value)}
                  >
                    {ASSIGNABLE.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => removeMember(m.userId)}
                  >
                    Quitar
                  </Button>
                </div>
              ) : (
                <span className="text-muted-foreground text-sm">
                  {ROLE_LABEL[m.role]}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {canManage && <InviteForm storeId={storeId} onError={setError} />}
    </section>
  );
}

/** Formulario para invitar a alguien por email con un rol asignable. */
function InviteForm({
  storeId,
  onError,
}: {
  storeId: string;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const emailId = useId();
  const roleId = useId();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/v1/stores/${storeId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        role: form.get('role'),
      }),
    });
    setLoading(false);
    if (res.ok) {
      (e.target as HTMLFormElement).reset();
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    onError(data?.error ?? 'No se pudo invitar.');
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass max-w-md space-y-4 rounded-lg p-4"
    >
      <h3 className="font-medium text-foreground">Invitar al equipo</h3>

      <div className="space-y-1.5">
        <Label htmlFor={emailId}>Email</Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          required
          placeholder="persona@ejemplo.com"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={roleId}>Rol</Label>
        <select
          id={roleId}
          name="role"
          className={cn(fieldClass, 'w-full')}
          defaultValue="sales"
        >
          {ASSIGNABLE.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Invitando…' : 'Invitar'}
      </Button>
    </form>
  );
}
