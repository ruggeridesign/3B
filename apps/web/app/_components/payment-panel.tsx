'use client';

import type {
  CreateMediaResponse,
  OrderStatus,
  PaymentMethodType,
  PaymentReport,
} from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

const PROOF_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/**
 * Sube el comprobante (captura) en dos fases y lo marca listo. Es media propia
 * del comprador (`ownerType: 'user'`); la visibilidad cruzada al Seller la da la
 * policy `media_select_payment_proof` (vía `payment_reports.proof_media_id`).
 */
async function uploadProof(file: File, meId: string): Promise<string> {
  const createRes = await fetch('/v1/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerType: 'user', ownerId: meId, mime: file.type }),
  });
  if (!createRes.ok) throw new Error('No se pudo iniciar la subida.');
  const { media, upload } = (await createRes.json()) as CreateMediaResponse;
  const putRes = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: file,
  });
  if (!putRes.ok) throw new Error('No se pudo subir el comprobante.');
  await fetch(`/v1/media/${media.id}/complete`, { method: 'POST' });
  return media.id;
}

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
  meId,
  payments,
  proofUrls,
  defaultAmount,
  defaultCurrency,
}: {
  orderId: string;
  status: OrderStatus;
  isMaker: boolean;
  isSeller: boolean;
  meId: string;
  payments: PaymentReport[];
  proofUrls: Record<string, string>;
  defaultAmount: string;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const methodId = useId();
  const refId = useId();
  const amountId = useId();
  const proofId = useId();
  const proofRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canReport = isMaker && status === 'aceptado';
  const canReview = isSeller && status === 'pago_reportado';

  async function report(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const file = proofRef.current?.files?.[0];
      let proofMediaId: string | undefined;
      if (file) {
        if (!PROOF_MIMES.includes(file.type)) {
          setError('Formato de captura no soportado (JPG, PNG, WebP o AVIF).');
          setBusy(false);
          return;
        }
        proofMediaId = await uploadProof(file, meId);
      }
      const res = await fetch(`/v1/orders/${orderId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: form.get('method'),
          reference: String(form.get('reference') ?? '').trim(),
          amount: String(form.get('amount') ?? '').trim(),
          currency: defaultCurrency,
          proofMediaId,
        }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? 'No se pudo reportar el pago.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reportar.');
    } finally {
      setBusy(false);
    }
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
          {payments.map((p) => {
            const proof = p.proofMediaId
              ? proofUrls[p.proofMediaId]
              : undefined;
            return (
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
                {proof && (
                  <a
                    href={proof}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full"
                  >
                    {/* biome-ignore lint/performance/noImgElement: storage local de dev; next/image llega con el pulido visual */}
                    <img
                      src={proof}
                      alt="Comprobante de pago"
                      className="h-32 w-auto rounded-md border border-border object-contain"
                    />
                  </a>
                )}
              </li>
            );
          })}
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
            <div className="space-y-1.5">
              <Label htmlFor={proofId}>Captura (opcional)</Label>
              <input
                ref={proofRef}
                id={proofId}
                type="file"
                accept={PROOF_MIMES.join(',')}
                className="block text-foreground text-sm"
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
