'use client';

import type { OrderStatus } from '@3b/contracts';
import { Button } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mutate } from '../../lib/mutate';
import type { OrderAction } from '../../lib/orders';

/**
 * Botonera de transición de un pedido (M5b). Cada acción dispara
 * `POST /v1/orders/{id}/transition`; al concretarse, refresca la vista. Las
 * acciones las decide el server (según rol y máquina de estados §6); acá solo se
 * renderizan y se envían. `rechazado`/`cancelado` se muestran como destructivas.
 */
export function OrderActions({
  orderId,
  actions,
}: {
  orderId: string;
  actions: OrderAction[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (actions.length === 0) return null;

  async function run(toStatus: OrderStatus) {
    setError(null);
    setBusy(toStatus);
    const outcome = await mutate(`/v1/orders/${orderId}/transition`, {
      method: 'POST',
      body: { toStatus },
    });
    setBusy(null);
    if (outcome.status === 'ok') {
      router.refresh();
    } else if (outcome.status === 'error') {
      setError(outcome.message);
    }
    // 'queued': el <QueuedToast/> global avisa; nada que mover todavía.
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => {
          const destructive =
            a.toStatus === 'rechazado' || a.toStatus === 'cancelado';
          return (
            <Button
              key={a.toStatus}
              size="sm"
              variant={destructive ? 'outline' : 'default'}
              disabled={busy !== null}
              onClick={() => run(a.toStatus)}
            >
              {busy === a.toStatus ? 'Procesando…' : a.label}
            </Button>
          );
        })}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
