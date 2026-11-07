'use client';

import type { Shipment } from '@3b/contracts';
import { Button, Input } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mutate } from '../../lib/mutate';

/**
 * Cola del Mover (M6a): solicitudes de envío abiertas en sus comunidades. Por cada
 * una, un formulario para **ofertar** (precio + ETA) que dispara
 * `POST /v1/shipments/{id}/offers`. El envío pasa a `ofertado` al recibir la oferta.
 */
export function MoverQueue({ shipments }: { shipments: Shipment[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function offer(
    e: React.FormEvent<HTMLFormElement>,
    shipmentId: string,
  ) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const price = String(form.get('price') ?? '').trim();
    const etaMin = Number(form.get('etaMin') ?? 0);
    if (!price || etaMin <= 0) return;
    setBusy(shipmentId);
    const outcome = await mutate(`/v1/shipments/${shipmentId}/offers`, {
      method: 'POST',
      body: { price, etaMin },
    });
    setBusy(null);
    if (outcome.status === 'error') {
      setError(outcome.message);
      return;
    }
    router.refresh();
  }

  if (shipments.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No hay solicitudes de envío abiertas en tus comunidades.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {shipments.map((s) => (
          <li key={s.id} className="glass space-y-2 rounded-lg p-4">
            <div>
              <p className="font-medium text-foreground text-sm">
                {s.originRef ?? 'Origen'} → {s.destRef ?? 'Destino'}
              </p>
              {s.packageNote && (
                <p className="text-muted-foreground text-xs">{s.packageNote}</p>
              )}
            </div>
            <form
              onSubmit={(e) => offer(e, s.id)}
              className="flex flex-wrap items-end gap-2"
            >
              <Input
                name="price"
                inputMode="decimal"
                placeholder="Precio USD"
                className="w-28"
                aria-label="Precio en USD"
              />
              <Input
                name="etaMin"
                inputMode="numeric"
                placeholder="ETA min"
                className="w-24"
                aria-label="ETA en minutos"
              />
              <Button type="submit" size="sm" disabled={busy === s.id}>
                {busy === s.id ? 'Enviando…' : 'Ofertar'}
              </Button>
            </form>
          </li>
        ))}
      </ul>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
