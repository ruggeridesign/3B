'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface U {
  id: string;
  email: string;
  name: string | null;
}

export function VerComo() {
  const router = useRouter();
  const [users, setUsers] = useState<U[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (users || loading) return;
    setLoading(true);
    const res = await fetch('/v1/admin/users');
    if (res.ok) {
      const data = (await res.json()) as { users: U[] };
      setUsers(data.users);
    }
    setLoading(false);
  }

  async function pick(id: string) {
    await fetch('/v1/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id }),
    });
    router.push('/');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" onClick={load}>
          Ver como
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>Ver como…</DropdownMenuLabel>
        {!users && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            {loading ? 'Cargando…' : '—'}
          </div>
        )}
        {users?.map((u) => (
          <DropdownMenuItem key={u.id} onClick={() => pick(u.id)}>
            {u.name ?? u.email}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
