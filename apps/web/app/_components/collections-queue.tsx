'use client';

import type { PaymentReport, Statement } from '@3b/contracts';
import { Button } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** `YYYY-MM` → rótulo legible (ej. "octubre 2026"). */
function formatPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Un cobro por confirmar: el estado de cuenta `pending` + su comprobante reportado. */
export type Collection = {
  statement: Statement;
  report: PaymentReport | null;
};

/**
 * Cola de **cobros por confirmar** del admin (M7c.2). Lista los estados de cuenta
 * `pending` con su comprobante reportado; confirmar → `paid`, rechazar → vuelve a `open`
 * (reintento). Dispara `POST /v1/statements/{id}/payments/{paymentId}/review` y refresca.
 */
export function CollectionsQueue({
  collections,
}: {
  collections: Collection[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function review(
    statementId: string,
    paymentId: string,
    decision: 'confirm' | 'reject',
  ) {
    setError(null);
    setBusy(paymentId);
    try {
      const res = await fetch(
        `/v1/statements/${statementId}/payments/${paymentId}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        },
      );
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? 'No se pudo revisar el cobro.');
    } catch {
      setError('No se pudo revisar el cobro.');
    } finally {
      setBusy(null);
    }
  }

  if (collections.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No hay cobros por confirmar.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {collections.map(({ statement: s, report }) => (
          <li
            key={s.id}
            className="glass flex flex-wrap items-center justify-between gap-2 rounded-lg p-3"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium text-foreground text-sm capitalize">
                {s.subjectType === 'store' ? 'Tienda' : 'Mover'} ·{' '}
                {formatPeriod(s.period)}
                <span className="ml-2 font-semibold">
                  {s.currency} {s.total}
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                {report
                  ? `${report.method} · ref. ${report.reference} · ${report.currency} ${report.amount}`
                  : 'Sin comprobante'}
              </p>
            </div>
            {report && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy === report.id}
                  onClick={() => review(s.id, report.id, 'confirm')}
                >
                  Confirmar cobro
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === report.id}
                  onClick={() => review(s.id, report.id, 'reject')}
                >
                  Rechazar
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </>
  );
}
