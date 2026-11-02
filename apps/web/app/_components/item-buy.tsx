'use client';

import type { PublicItem } from '@3b/contracts';
import { Button } from '@3b/ui';
import { useState } from 'react';
import { useCart } from './cart-provider';

/** Precio unitario efectivo de una variante (variante sobreescribe al ítem). */
function unitPrice(
  item: PublicItem,
  variantPrice: string | null,
): string | null {
  if (item.priceMode === 'quote') return null;
  return variantPrice ?? item.priceAmount;
}

/**
 * Opciones (variantes) de un ítem con "Agregar al carrito". Solo para ítems con
 * precio concreto (no "a cotizar"). Respeta el stock disponible cuando lo hay.
 */
export function ItemBuy({ item }: { item: PublicItem }) {
  const { add } = useCart();
  const [added, setAdded] = useState<string | null>(null);

  if (item.variants.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Este ítem todavía no tiene opciones para comprar.
      </p>
    );
  }

  return (
    <ul className="grid gap-2">
      {item.variants.map((v) => {
        const price = unitPrice(item, v.priceAmount);
        const soldOut = v.available != null && v.available <= 0;
        const canBuy = price != null && !soldOut;
        return (
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
                {price ? ` · ${item.currency} ${price}` : ' · a cotizar'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-muted-foreground text-xs">
                {v.available == null
                  ? ''
                  : soldOut
                    ? 'agotado'
                    : `${v.available} disp.`}
              </span>
              <Button
                size="sm"
                disabled={!canBuy}
                onClick={() => {
                  if (!price) return;
                  add({
                    variantId: v.id,
                    itemId: item.id,
                    storeId: item.storeId,
                    storeName: item.storeName,
                    title: item.title,
                    sku: v.sku,
                    unitPrice: price,
                    currency: item.currency,
                  });
                  setAdded(v.id);
                  window.setTimeout(() => setAdded(null), 1500);
                }}
              >
                {added === v.id ? 'Agregado ✓' : 'Agregar'}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
