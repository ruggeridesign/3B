'use client';

import { Button, cn, Input, Label } from '@3b/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { type CartLine, useCart } from '../../../_components/cart-provider';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

/** Suma en centavos enteros (evita drift de coma flotante al mostrar). */
function subtotalOf(lines: CartLine[]): string {
  const cents = lines.reduce((acc, l) => {
    const [whole, frac = '0'] = l.unitPrice.split('.');
    const c =
      Number.parseInt(whole ?? '0', 10) * 100 +
      Number.parseInt((frac + '00').slice(0, 2), 10);
    return acc + c * l.qty;
  }, 0);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

interface Confirmed {
  number: number;
  id: string;
}

/** Bloque de checkout de una tienda (un pedido por tienda). */
function StoreGroup({
  storeId,
  lines,
}: {
  storeId: string;
  lines: CartLine[];
}) {
  const { setQty, remove, clearStore } = useCart();
  const router = useRouter();
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>(
    'pickup',
  );
  const [addr, setAddr] = useState({ line1: '', phone: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Confirmed | null>(null);
  // Clave de idempotencia por firma del pedido: un reintento del mismo contenido
  // reusa la clave (no duplica); si cambia el carrito, se genera otra.
  const idem = useRef<{ sig: string; key: string } | null>(null);

  const storeName = lines[0]?.storeName ?? 'Tienda';
  const currency = lines[0]?.currency ?? 'USD';

  async function confirm() {
    setError(null);
    if (fulfillment === 'delivery' && addr.line1.trim().length < 2) {
      setError('El envío a domicilio requiere una dirección.');
      return;
    }
    const body = {
      storeId,
      fulfillment,
      items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      ...(fulfillment === 'delivery'
        ? {
            address: {
              line1: addr.line1.trim(),
              ...(addr.phone.trim() ? { phone: addr.phone.trim() } : {}),
              ...(addr.notes.trim() ? { notes: addr.notes.trim() } : {}),
            },
          }
        : {}),
    };
    const sig = JSON.stringify(body);
    if (!idem.current || idem.current.sig !== sig) {
      idem.current = { sig, key: crypto.randomUUID() };
    }
    setLoading(true);
    try {
      const res = await fetch('/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idem.current.key,
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as {
        number?: number;
        id?: string;
        error?: string;
      } | null;
      if (res.ok && data?.id && data.number != null) {
        setDone({ number: data.number, id: data.id });
        clearStore(storeId);
        router.refresh();
        return;
      }
      setError(data?.error ?? 'No se pudo crear el pedido.');
    } catch {
      setError('Error de red al crear el pedido.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <section className="glass space-y-2 rounded-lg p-4">
        <h2 className="font-medium text-foreground">{storeName}</h2>
        <p className="text-foreground text-sm">
          Pedido <span className="font-medium">#{done.number}</span> realizado.
        </p>
        <Link
          href={`/comprar/pedidos/${done.id}`}
          className="text-sm text-foreground hover:underline"
        >
          Ver pedido →
        </Link>
      </section>
    );
  }

  return (
    <section className="glass space-y-3 rounded-lg p-4">
      <h2 className="font-medium text-foreground">{storeName}</h2>

      <ul className="space-y-2">
        {lines.map((l) => (
          <li
            key={l.variantId}
            className="flex items-center justify-between gap-3 border-border border-b pb-2 last:border-0"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground text-sm">
                {l.title}
              </p>
              <p className="text-muted-foreground text-xs">
                {l.sku ?? ''} · {l.currency} {l.unitPrice} c/u
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="number"
                min={1}
                max={999}
                value={l.qty}
                onChange={(e) =>
                  setQty(l.variantId, Math.max(1, Number(e.target.value) || 1))
                }
                className={cn(fieldClass, 'h-8 w-16')}
                aria-label={`Cantidad de ${l.title}`}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(l.variantId)}
              >
                Quitar
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-right text-foreground text-sm">
        Subtotal:{' '}
        <span className="font-medium">
          {currency} {subtotalOf(lines)}
        </span>
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={`fulfillment-${storeId}`}>Entrega</Label>
        <select
          id={`fulfillment-${storeId}`}
          value={fulfillment}
          onChange={(e) =>
            setFulfillment(e.target.value as 'pickup' | 'delivery')
          }
          className={fieldClass}
        >
          <option value="pickup">Retiro en tienda</option>
          <option value="delivery">Envío a domicilio</option>
        </select>
      </div>

      {fulfillment === 'delivery' && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor={`addr-${storeId}`}>Dirección</Label>
            <Input
              id={`addr-${storeId}`}
              value={addr.line1}
              onChange={(e) => setAddr({ ...addr, line1: e.target.value })}
              placeholder="Calle, número, referencia"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`phone-${storeId}`}>Teléfono (opcional)</Label>
            <Input
              id={`phone-${storeId}`}
              value={addr.phone}
              onChange={(e) => setAddr({ ...addr, phone: e.target.value })}
              maxLength={40}
            />
          </div>
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button onClick={confirm} disabled={loading}>
        {loading ? 'Confirmando…' : 'Confirmar pedido'}
      </Button>
    </section>
  );
}

export default function Carrito() {
  const { lines } = useCart();

  const byStore = new Map<string, CartLine[]>();
  for (const l of lines) {
    const list = byStore.get(l.storeId) ?? [];
    list.push(l);
    byStore.set(l.storeId, list);
  }
  const groups = [...byStore.entries()];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/comprar" className="text-muted-foreground text-sm">
          ← Comprar
        </Link>
        <h1 className="font-bold text-2xl text-foreground">Carrito</h1>
        <p className="text-muted-foreground text-sm">
          Cada tienda se confirma como un pedido aparte.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Tu carrito está vacío.{' '}
          <Link href="/comprar" className="text-foreground hover:underline">
            Explorá ítems
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map(([storeId, storeLines]) => (
            <StoreGroup key={storeId} storeId={storeId} lines={storeLines} />
          ))}
        </div>
      )}
    </div>
  );
}
