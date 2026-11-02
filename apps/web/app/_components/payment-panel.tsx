'use client';

import type {
  OrderStatus,
  PaymentMethodType,
  PaymentReport,
} from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

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

const STATUS_LABEL: Record<PaymentReport['status'], string> = {
  reported: 'Reportado',
  confirmed: 'Confirmado',
  rejected: 'Rechazado',
};

/**
 * Panel de pago de un pedido (M5c). El comprador (Maker) reporta un pago cuando
 * el pedido está `aceptado`; la tienda (Seller) confirma o rechaza cuando está
 * `pago_reportado`. Ambos ven el historial de comprobantes. Dispara
 * `POST /v1/orders/{id}/payments` y `.../{paymentId}/review` y refresca.
 */
export function PaymentPanel({
  orderId,
  status,
  isMaker,
  isSeller,
  payments,
  defaultAmount,
  defaultCurrency,
}: {
  orderId: string;
  status: OrderStatus;
  isMaker: boolean;
  isSeller: boolean;
  payments: PaymentReport[];
  defaultAmount: string;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const methodId = useId();
  const refId = useId();
  const amountId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canReport = isMaker && status === 'aceptado';
  const canReview = isSeller && status === 'pago_reportado';

  async function report(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const res = await fetch(`/v1/orders/${orderId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: form.get('method'),
        reference: String(form.get('reference') ?? '').trim(),
        amount: String(form.get('amount') ?? '').trim(),
        currency: defaultCurrency,
      }),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo reportar el pago.');
  }

  async function review(paymentId: string, decision: 'confirm' | 'reject') {
    setError(null);
    setBusy(true);
    const res = await fetch(
      `/v1/orders/${orderId}/payments/${paymentId}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      },
    );
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo revisar el pago.');
  }

  // Sin formularios ni comprobantes: no mostramos el panel.
  if (!canReport && !canReview && payments.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-foreground">Pago</h2>

      {payments.length > 0 && (
        <ul className="space-y-2">
          {payments.map((p) => (
            <li
              key={p.id}
              className="glass flex flex-wrap items-center justify-between gap-2 rounded-lg p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm">
                  {METHOD_LABEL[p.method]} · ref. {p.reference}
                  <span className="ml-2 rounded-md bg-seller/20 px-1.5 py-0.5 align-middle text-foreground text-xs">
                    {STATUS_LABEL[p.status]}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  {p.currency} {p.amount}
                </p>
              </div>
              {canReview && p.status === 'reported' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => review(p.id, 'confirm')}
                  >
                    Confirmar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => review(p.id, 'reject')}
                  >
                    Rechazar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canReport && (
        <form onSubmit={report} className="space-y-2">
          <p className="text-muted-foreground text-sm">
            Ya pagaste? Reportá el comprobante para que la tienda lo confirme.
          </p>
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
        </form>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </section>
  );
}
