'use client';

import type { MeCommunity } from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

/** Formulario para abrir una tienda. La comunidad sale de las del usuario. */
export function CreateStore({ communities }: { communities: MeCommunity[] }) {
  const router = useRouter();
  const nameId = useId();
  const slugId = useId();
  const kindId = useId();
  const communityId = useId();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/v1/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        communityId: form.get('communityId'),
        kind: form.get('kind'),
        slug: form.get('slug'),
        name: form.get('name'),
      }),
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
      (e.target as HTMLFormElement).reset();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo abrir la tienda.');
  }

  if (communities.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Necesitás pertenecer a una comunidad para abrir una tienda.
      </p>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass max-w-md space-y-4 rounded-lg p-4"
    >
      <h2 className="font-medium text-foreground">Abrir una tienda</h2>

      <div className="space-y-1.5">
        <Label htmlFor={nameId}>Nombre</Label>
        <Input id={nameId} name="name" required minLength={2} maxLength={80} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={slugId}>Slug</Label>
        <Input
          id={slugId}
          name="slug"
          required
          placeholder="mi-tienda"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          title="Minúsculas, números y guiones."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={kindId}>Tipo</Label>
        <select
          id={kindId}
          name="kind"
          className={fieldClass}
          defaultValue="products"
        >
          <option value="products">Productos</option>
          <option value="services">Servicios</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={communityId}>Comunidad</Label>
        <select id={communityId} name="communityId" className={fieldClass}>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? 'Abriendo…' : 'Abrir tienda'}
      </Button>
    </form>
  );
}
