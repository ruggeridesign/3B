'use client';

import type { Shipment, ShipmentStatus } from '@3b/contracts';
import { Button, Input } from '@3b/ui';
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

// Próximo paso del viaje (estado destino + etiqueta del botón).
const NEXT: Partial<
  Record<Shipment['status'], { to: ShipmentStatus; label: string }>
> = {
  asignado: { to: 'hacia_retiro', label: 'Voy al retiro' },
  hacia_retiro: { to: 'retirado', label: 'Marcar retirado' },
  retirado: { to: 'en_transito', label: 'En camino' },
};

/**
 * Mis viajes (Mover, M6c): avanza el viaje (`asignado → … → en_transito`) y
 * **entrega** validando el PIN del receptor (S-3). Al entregar, el backend consume
 * el stock y mueve el pedido a `entregado`.
 */
export function MoverTrip({ trips }: { trips: Shipment[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function progress(id: string, toStatus: ShipmentStatus) {
    setError(null);
    setBusy(id);
    const res = await fetch(`/v1/shipments/${id}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toStatus }),
    });
    setBusy(null);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo avanzar el viaje.');
  }

  async function deliver(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    setError(null);
    const pin = String(new FormData(e.currentTarget).get('pin') ?? '').trim();
    if (!/^\d{4,10}$/.test(pin)) {
      setError('El PIN son 4 a 10 dígitos.');
      return;
    }
    setBusy(id);
    const res = await fetch(`/v1/shipments/${id}/deliver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    setBusy(null);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo entregar.');
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {trips.map((s) => {
          const next = NEXT[s.status];
          return (
            <li key={s.id} className="glass space-y-2 rounded-lg p-4">
              <div>
                <p className="font-medium text-foreground text-sm">
                  {s.originRef ?? 'Origen'} → {s.destRef ?? 'Destino'}
                  <span className="ml-2 rounded-md bg-mover/20 px-1.5 py-0.5 align-middle text-foreground text-xs">
                    {STATUS_LABEL[s.status]}
                  </span>
                </p>
                {s.agreedPrice && (
                  <p className="text-muted-foreground text-xs">
                    Acordado: USD {s.agreedPrice}
                  </p>
                )}
              </div>

              {next && (
                <Button
                  size="sm"
                  disabled={busy === s.id}
                  onClick={() => progress(s.id, next.to)}
                >
                  {busy === s.id ? 'Guardando…' : next.label}
                </Button>
              )}

              {s.status === 'en_transito' && (
                <form
                  onSubmit={(e) => deliver(e, s.id)}
                  className="flex items-end gap-2"
                >
                  <Input
                    name="pin"
                    inputMode="numeric"
                    placeholder="PIN del receptor"
                    className="w-40"
                    aria-label="PIN de entrega"
                  />
                  <Button type="submit" size="sm" disabled={busy === s.id}>
                    {busy === s.id ? 'Entregando…' : 'Entregar'}
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
