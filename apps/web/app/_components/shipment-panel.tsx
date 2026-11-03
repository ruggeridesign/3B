'use client';

import type { Shipment } from '@3b/contracts';
import { Button } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const STATUS_LABEL: Record<Shipment['status'], string> = {
  solicitado: 'Solicitado',
  ofertado: 'Ofertado',
  asignado: 'Asignado',
  hacia_retiro: 'Hacia el retiro',
  retirado: 'Retirado',
  en_transito: 'En tránsito',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  fallido: 'Fallido',
};

/**
 * Panel de envío en la ficha del pedido (M6a). Para un pedido `delivery`: si no
 * hay envío y el viewer es de la tienda, ofrece **solicitar** uno; si hay envío,
 * muestra su estado y las **ofertas** de Movers. La aceptación de una oferta
 * (asignación + PIN) llega en M6b.
 */
export function ShipmentPanel({
  orderId,
  fulfillment,
  shipment,
  isSeller,
}: {
  orderId: string;
  fulfillment: string;
  shipment: Shipment | null;
  isSeller: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Los envíos son solo para pedidos a domicilio.
  if (fulfillment !== 'delivery') return null;

  async function request() {
    setError(null);
    setBusy(true);
    const res = await fetch('/v1/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo solicitar el envío.');
  }

  if (!shipment) {
    if (!isSeller) return null;
    return (
      <section className="space-y-2">
        <h2 className="font-medium text-foreground">Envío</h2>
        <p className="text-muted-foreground text-sm">
          Este pedido es a domicilio. Solicitá un envío para que los Movers
          oferten.
        </p>
        <Button size="sm" disabled={busy} onClick={request}>
          {busy ? 'Solicitando…' : 'Solicitar envío'}
        </Button>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </section>
    );
  }

  const offers = shipment.offers ?? [];
  return (
    <section className="space-y-3">
      <h2 className="font-medium text-foreground">
        Envío
        <span className="ml-2 rounded-md bg-mover/20 px-1.5 py-0.5 align-middle text-foreground text-xs">
          {STATUS_LABEL[shipment.status]}
        </span>
      </h2>
      <p className="text-muted-foreground text-sm">
        {shipment.originRef ?? 'Origen'} → {shipment.destRef ?? 'Destino'}
      </p>

      {offers.length > 0 ? (
        <ul className="space-y-2">
          {offers.map((o) => (
            <li
              key={o.id}
              className="glass flex items-center justify-between gap-2 rounded-lg p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm">
                  {o.moverName ?? 'Mover'} · {o.etaMin} min
                </p>
                <p className="text-muted-foreground text-xs">
                  Oferta: USD {o.price}
                </p>
              </div>
              {/* Aceptar la oferta (asignación + PIN) llega en M6b. */}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          Esperando ofertas de Movers…
        </p>
      )}
    </section>
  );
}
