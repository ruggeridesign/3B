'use client';

import type { AttributeDefinition, ItemVariant } from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

/** Editor de variantes: lista + alta (ejes desde los atributos variant_axis). */
export function ItemVariants({
  storeId,
  itemId,
  variants,
  axes,
  canManage,
}: {
  storeId: string;
  itemId: string;
  variants: ItemVariant[];
  axes: AttributeDefinition[];
  canManage: boolean;
}) {
  const router = useRouter();
  const skuId = useId();
  const priceId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/v1/stores/${storeId}/items/${itemId}/variants`;

  async function remove(id: string) {
    setBusy(true);
    const res = await fetch(`${base}/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError('No se pudo borrar la variante.');
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const axisValues: Record<string, string | number | boolean> = {};
    for (const axis of axes) {
      const raw = String(form.get(`axis:${axis.key}`) ?? '').trim();
      if (!raw) continue;
      axisValues[axis.key] = axis.dataType === 'number' ? Number(raw) : raw;
    }
    const price = String(form.get('priceAmount') ?? '').trim();
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: form.get('sku'),
        axisValues,
        priceAmount: price || undefined,
      }),
    });
    setBusy(false);
    if (res.ok) {
      (e.target as HTMLFormElement).reset();
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo crear la variante.');
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-foreground">Variantes</h2>

      {variants.length > 0 ? (
        <ul className="grid gap-2">
          {variants.map((v) => (
            <li
              key={v.id}
              className="glass flex items-center justify-between gap-3 rounded-lg p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{v.sku}</p>
                <p className="text-muted-foreground text-sm">
                  {Object.entries(v.axisValues)
                    .map(([k, val]) => `${k}: ${val}`)
                    .join(' · ') || 'sin ejes'}
                  {v.priceAmount ? ` · ${v.priceAmount}` : ''}
                </p>
              </div>
              {canManage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => remove(v.id)}
                >
                  Borrar
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Sin variantes todavía.</p>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {canManage && (
        <form
          onSubmit={onSubmit}
          className="glass max-w-md space-y-4 rounded-lg p-4"
        >
          <h3 className="font-medium text-foreground">Agregar variante</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={skuId}>SKU</Label>
              <Input
                id={skuId}
                name="sku"
                required
                placeholder="TAL-650-NEGRO"
                pattern="[A-Za-z0-9_-]+"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={priceId}>Precio (opcional)</Label>
              <Input id={priceId} name="priceAmount" inputMode="decimal" />
            </div>
          </div>

          {axes.length > 0 ? (
            axes.map((axis) => (
              <AxisField key={axis.id} axis={axis} fieldClass={fieldClass} />
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              No hay ejes de variante definidos (marcá un atributo como “eje de
              variante”).
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? 'Agregando…' : 'Agregar variante'}
          </Button>
        </form>
      )}
    </section>
  );
}

/** Campo para un eje de variante (select si es enum, si no input). */
function AxisField({
  axis,
  fieldClass,
}: {
  axis: AttributeDefinition;
  fieldClass: string;
}) {
  const id = useId();
  const name = `axis:${axis.key}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{axis.label}</Label>
      {axis.dataType === 'enum' ? (
        <select id={id} name={name} className={fieldClass} defaultValue="">
          <option value="">—</option>
          {(axis.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <Input id={id} name={name} />
      )}
    </div>
  );
}
