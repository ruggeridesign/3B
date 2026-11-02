'use client';

import type { Report } from '@3b/contracts';
import { Button } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const TARGET_LABEL: Record<Report['targetType'], string> = {
  item: 'Ítem',
  review: 'Reseña',
  question: 'Pregunta',
  store: 'Tienda',
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Cola de moderación (M5d.4): lista los reportes abiertos y permite resolver o
 * descartar (`POST /v1/reports/{id}/resolve`). La RLS acota lo que se ve y quién
 * puede resolver (admin de la comunidad o de plataforma).
 */
export function ReportsQueue({ reports }: { reports: Report[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string, status: 'resolved' | 'dismissed') {
    setError(null);
    setBusy(id);
    const res = await fetch(`/v1/reports/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setBusy(null);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo resolver el reporte.');
  }

  if (reports.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No hay reportes abiertos.</p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {reports.map((r) => (
          <li
            key={r.id}
            className="glass flex flex-wrap items-center justify-between gap-2 rounded-lg p-3"
          >
            <div className="min-w-0">
              <p className="text-foreground text-sm">
                <span className="rounded-md bg-seller/20 px-1.5 py-0.5 text-xs">
                  {TARGET_LABEL[r.targetType]}
                </span>{' '}
                {r.reason}
              </p>
              <p className="text-muted-foreground text-xs">
                {fmt(r.createdAt)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy === r.id}
                onClick={() => resolve(r.id, 'resolved')}
              >
                Resolver
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === r.id}
                onClick={() => resolve(r.id, 'dismissed')}
              >
                Descartar
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
