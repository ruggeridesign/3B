'use client';

import type { PaymentMethodType } from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { mutate } from '../../lib/mutate';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

const METHOD_LABEL: Record<PaymentMethodType, string> = {
  pago_movil: 'Pago móvil',
  transferencia: 'Transferencia',
  zelle: 'Zelle',
  binance: 'Binance',
  efectivo: 'Efectivo',
  otro: 'Otro',
};

/**
 * Formulario para que el **sujeto** (tienda/Mover) reporte el pago de un estado de
 * cuenta `open` (M7c.2). Dispara `POST /v1/statements/{id}/payments`; el estado de
 * cuenta pasa a `pending` (el admin lo confirma). Compacto, sin captura (llega después).
 */
export function StatementReport({
  statementId,
  defaultAmount,
  currency,
}: {
  statementId: string;
  defaultAmount: string;
  currency: string;
}) {
  const router = useRouter();
  const methodId = useId();
  const refId = useId();
  const amountId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function report(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const outcome = await mutate(`/v1/statements/${statementId}/payments`, {
      method: 'POST',
      body: {
        method: form.get('method'),
        reference: String(form.get('reference') ?? '').trim(),
        amount: String(form.get('amount') ?? '').trim(),
        currency,
      },
    });
    setBusy(false);
    if (outcome.status === 'error') {
      setError(outcome.message);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={report} className="mt-2 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={methodId}>Método</Label>
          <select id={methodId} name="method" className={fieldClass}>
            {(Object.keys(METHOD_LABEL) as PaymentMethodType[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={refId}>Referencia</Label>
          <Input id={refId} name="reference" required className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={amountId}>Monto</Label>
          <Input
            id={amountId}
            name="amount"
            inputMode="decimal"
            defaultValue={defaultAmount}
            className="w-28"
          />
        </div>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Enviando…' : 'Reportar pago'}
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  );
}
