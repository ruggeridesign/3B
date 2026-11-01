'use client';

import type { ItemVariant, StockLevel, StockMovementKind } from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

const KIND_LABELS: Record<StockMovementKind, string> = {
  receipt: 'Ingreso',
  sale: 'Venta',
  adjustment: 'Ajuste',
  return: 'Devolución',
};

/**
 * Inventario del ítem: existencias por variante (disponible / físico) y un
 * formulario por variante para aplicar un movimiento (mostrador/ajuste). Solo
 * `canManage` ve el formulario; el stock lo ven todos los miembros.
 */
export function ItemStock({
  storeId,
  itemId,
  variants,
  levels,
  canManage,
}: {
  storeId: string;
  itemId: string;
  variants: ItemVariant[];
  levels: StockLevel[];
  canManage: boolean;
}) {
  if (variants.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="font-medium text-foreground">Inventario</h2>
        <p className="text-muted-foreground text-sm">
          El inventario se lleva por variante. Agregá variantes para controlar
          stock.
        </p>
      </section>
    );
  }
  const byVariant = new Map(levels.map((l) => [l.variantId, l]));
  return (
    <section className="space-y-3">
      <h2 className="font-medium text-foreground">Inventario</h2>
      <ul className="grid gap-2">
        {variants.map((v) => (
          <VariantStock
            key={v.id}
            storeId={storeId}
            itemId={itemId}
            variant={v}
            level={byVariant.get(v.id) ?? null}
            canManage={canManage}
          />
        ))}
      </ul>
    </section>
  );
}

function VariantStock({
  storeId,
  itemId,
  variant,
  level,
  canManage,
}: {
  storeId: string;
  itemId: string;
  variant: ItemVariant;
  level: StockLevel | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const kindId = useId();
  const qtyId = useId();
  const [kind, setKind] = useState<StockMovementKind>('receipt');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/v1/stores/${storeId}/items/${itemId}/variants/${variant.id}/movements`;
  const available = level?.available ?? 0;
  const onHand = level?.onHand ?? 0;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const mag = Math.abs(Number(form.get('qty')));
    if (!Number.isInteger(mag) || mag <= 0) {
      setError('Cantidad inválida.');
      return;
    }
    // El signo lo deriva el tipo (ajuste: el usuario marca si resta).
    const subtract = kind === 'sale' || form.get('subtract') === 'on';
    const qty = subtract ? -mag : mag;
    setBusy(true);
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, qty }),
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
    setError(data?.error ?? 'No se pudo aplicar el movimiento.');
  }

  return (
    <li className="glass space-y-2 rounded-lg p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-foreground">{variant.sku}</p>
        <p className="text-muted-foreground text-sm">
          disponible <span className="text-foreground">{available}</span>
          {onHand !== available ? ` · físico ${onHand}` : ''}
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {canManage && (
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={kindId}>Movimiento</Label>
            <select
              id={kindId}
              className={fieldClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as StockMovementKind)}
            >
              {(Object.keys(KIND_LABELS) as StockMovementKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={qtyId}>Cantidad</Label>
            <Input
              id={qtyId}
              name="qty"
              inputMode="numeric"
              defaultValue="1"
              className="w-24"
            />
          </div>
          {kind === 'adjustment' && (
            <label className="flex items-center gap-1.5 pb-2 text-muted-foreground text-sm">
              <input type="checkbox" name="subtract" /> restar
            </label>
          )}
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Aplicando…' : 'Aplicar'}
          </Button>
        </form>
      )}
    </li>
  );
}
