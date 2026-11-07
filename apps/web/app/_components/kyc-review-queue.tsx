'use client';

import type { KycDocType, KycSubmission } from '@3b/contracts';
import { Button } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mutate } from '../../lib/mutate';

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

/** Una verificación de la cola + su rótulo (nombre de tienda o "Mover"). */
export type KycReviewItem = {
  submission: KycSubmission;
  label: string;
};

/**
 * Cola de verificaciones (KYC) del admin de comunidad (M7d): de **tienda** (sube el
 * `verification_level`) y de **Mover** (al aprobar, el solicitante pasa a ser Mover).
 * Aprueba o rechaza (`POST /v1/kyc/{id}/review`); la RLS acota la revisión al admin de
 * la comunidad del sujeto.
 */
export function KycReviewQueue({ items }: { items: KycReviewItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(id: string, decision: 'approve' | 'reject') {
    setError(null);
    setBusy(id);
    const outcome = await mutate(`/v1/kyc/${id}/review`, {
      method: 'POST',
      body: { decision },
    });
    setBusy(null);
    if (outcome.status === 'error') {
      setError(outcome.message);
      return;
    }
    router.refresh();
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
        {items.map(({ submission: s, label }) => (
          <li
            key={s.id}
            className="glass flex flex-wrap items-center justify-between gap-2 rounded-lg p-3"
          >
            <div className="min-w-0">
              <p className="text-foreground text-sm">
                <span className="font-medium">{label}</span>
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
