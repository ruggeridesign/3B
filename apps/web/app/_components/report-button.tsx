'use client';

import type { ReportTargetType } from '@3b/contracts';
import { Button, Input } from '@3b/ui';
import { useState } from 'react';
import { mutate } from '../../lib/mutate';

/**
 * Afordancia "Reportar" para un contenido (M5d.4). Abre un campo de motivo y
 * dispara `POST /v1/reports`; `communityId` lo deriva el backend del target.
 */
export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: ReportTargetType;
  targetId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <p className="text-muted-foreground text-xs">Reporte enviado. Gracias.</p>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const reason = String(
      new FormData(e.currentTarget).get('reason') ?? '',
    ).trim();
    if (reason.length < 3) return;
    setBusy(true);
    const outcome = await mutate('/v1/reports', {
      method: 'POST',
      body: { targetType, targetId, reason },
    });
    setBusy(false);
    if (outcome.status === 'error') {
      setError(outcome.message);
      return;
    }
    // ok o queued (el toast global avisa si quedó encolada)
    setDone(true);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground text-xs underline-offset-2 hover:underline"
      >
        Reportar
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <Input
        name="reason"
        placeholder="¿Qué problema tiene?"
        minLength={3}
        maxLength={1000}
        autoComplete="off"
        className="flex-1"
      />
      <Button type="submit" size="sm" variant="outline" disabled={busy}>
        Enviar
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </form>
  );
}
