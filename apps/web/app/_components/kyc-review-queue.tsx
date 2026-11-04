'use client';

import type { KycDocType, KycSubmission } from '@3b/contracts';
import { Button } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const DOC_LABEL: Record<KycDocType, string> = {
  rif: 'RIF',
  cedula: 'Cédula',
  pasaporte: 'Pasaporte',
  other: 'Otro',
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Una verificación de la cola + el nombre de su tienda (resuelto en el server). */
export type KycReviewItem = {
  submission: KycSubmission;
  storeName: string;
};

/**
 * Cola de verificaciones (KYC) de tienda del admin de comunidad (M7d). Aprueba o
 * rechaza (`POST /v1/kyc/{id}/review`); al aprobar, el trigger sube el
 * `verification_level` de la tienda. La RLS acota la revisión al admin de la
 * comunidad del sujeto.
 */
export function KycReviewQueue({ items }: { items: KycReviewItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(id: string, decision: 'approve' | 'reject') {
    setError(null);
    setBusy(id);
    const res = await fetch(`/v1/kyc/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    setBusy(null);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo revisar la verificación.');
  }

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No hay verificaciones pendientes.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {items.map(({ submission: s, storeName }) => (
          <li
            key={s.id}
            className="glass flex flex-wrap items-center justify-between gap-2 rounded-lg p-3"
          >
            <div className="min-w-0">
              <p className="text-foreground text-sm">
                <span className="font-medium">{storeName}</span>
                <span className="ml-2 rounded-md bg-seller/20 px-1.5 py-0.5 text-xs">
                  {DOC_LABEL[s.docType]}
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                {fmt(s.createdAt)}
                {s.mediaId ? ' · con documento' : ' · sin documento'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy === s.id}
                onClick={() => review(s.id, 'approve')}
              >
                Aprobar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === s.id}
                onClick={() => review(s.id, 'reject')}
              >
                Rechazar
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
