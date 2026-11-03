'use client';

import type { LocationPing, Shipment, ShipmentAssignment } from '@3b/contracts';
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
 * Panel de envío en la ficha del pedido. Para un pedido `delivery`: si no hay
 * envío y el viewer es de la tienda, **solicita** uno (M6a); si hay envío, muestra
 * estado + **ofertas**. El Seller **acepta** una oferta (M6b) cuando el pedido está
 * `listo` → se asigna el Mover y se muestra el **PIN** de entrega una vez.
 */
export function ShipmentPanel({
  orderId,
  fulfillment,
  orderStatus,
  shipment,
  isSeller,
  latestPing,
}: {
  orderId: string;
  fulfillment: string;
  orderStatus: string;
  shipment: Shipment | null;
  isSeller: boolean;
  latestPing?: LocationPing | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);

  // Los envíos son solo para pedidos a domicilio.
  if (fulfillment !== 'delivery') return null;

  async function request() {
    setError(null);
    setBusy('request');
    const res = await fetch('/v1/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    setBusy(null);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo solicitar el envío.');
  }

  async function accept(shipmentId: string, offerId: string) {
    setError(null);
    setBusy(offerId);
    const res = await fetch(
      `/v1/shipments/${shipmentId}/offers/${offerId}/accept`,
      { method: 'POST' },
    );
    setBusy(null);
    if (res.ok) {
      const data = (await res.json()) as ShipmentAssignment;
      setPin(data.pin); // se muestra una vez (solo se guarda el hash)
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo aceptar la oferta.');
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
        <Button size="sm" disabled={busy === 'request'} onClick={request}>
          {busy === 'request' ? 'Solicitando…' : 'Solicitar envío'}
        </Button>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </section>
    );
  }

  const offers = shipment.offers ?? [];
  const assigned = offers.find((o) => o.status === 'accepted');
  const canAccept = isSeller && shipment.status === 'ofertado';
  const orderReady = orderStatus === 'listo';

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

      {assigned && (
        <p className="text-foreground text-sm">
          Asignado a {assigned.moverName ?? 'un Mover'} · USD{' '}
          {shipment.agreedPrice ?? assigned.price}
        </p>
      )}

      {latestPing && (
        <p className="text-muted-foreground text-sm">
          📍 Mover en {latestPing.lat.toFixed(5)}, {latestPing.lng.toFixed(5)} ·{' '}
          {new Date(latestPing.recordedAt).toLocaleTimeString('es', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}

      {pin && (
        <div className="glass space-y-0.5 rounded-lg p-3">
          <p className="text-muted-foreground text-xs">
            PIN de entrega (compartilo con quien recibe; no se vuelve a
            mostrar):
          </p>
          <p className="font-bold font-mono text-foreground text-lg tracking-widest">
            {pin}
          </p>
        </div>
      )}

      {shipment.status === 'solicitado' && (
        <p className="text-muted-foreground text-sm">
          Esperando ofertas de Movers…
        </p>
      )}

      {shipment.status === 'ofertado' && (
        <ul className="space-y-2">
          {offers
            .filter((o) => o.status === 'active')
            .map((o) => (
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
                {canAccept && (
                  <Button
                    size="sm"
                    disabled={busy === o.id || !orderReady}
                    onClick={() => accept(shipment.id, o.id)}
                  >
                    {busy === o.id ? 'Asignando…' : 'Aceptar'}
                  </Button>
                )}
              </li>
            ))}
        </ul>
      )}

      {canAccept && !orderReady && (
        <p className="text-muted-foreground text-xs">
          Marcá el pedido como <strong>listo</strong> para asignar un Mover.
        </p>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </section>
  );
}
