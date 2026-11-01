'use client';

import { Button, cn, Input, Label } from '@3b/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId } from 'react';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

/** Barra de búsqueda del feed: texto + tipo. Empuja los filtros a la URL. */
export function DiscoverySearch({
  initialQ,
  initialKind,
}: {
  initialQ: string;
  initialKind: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qId = useId();
  const kindId = useId();

  function apply(next: { q?: string; kind?: string }) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete('offset');
    router.push(`${pathname}?${sp.toString()}`);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    apply({
      q: String(form.get('q') ?? '').trim(),
      kind: String(form.get('kind') ?? ''),
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1 space-y-1.5">
        <Label htmlFor={qId}>Buscar</Label>
        <Input
          id={qId}
          name="q"
          defaultValue={initialQ}
          placeholder="taladro, corte de pelo…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={kindId}>Tipo</Label>
        <select
          id={kindId}
          name="kind"
          className={fieldClass}
          defaultValue={initialKind}
        >
          <option value="">Todos</option>
          <option value="product">Productos</option>
          <option value="service">Servicios</option>
        </select>
      </div>
      <Button type="submit">Buscar</Button>
    </form>
  );
}
