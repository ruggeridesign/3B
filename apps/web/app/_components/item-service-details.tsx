'use client';

import type { ServiceDetail, ServiceModality } from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

const MODALITY_LABELS: Record<ServiceModality, string> = {
  in_store: 'En el local',
  on_site: 'A domicilio',
  remote: 'Remoto',
};

/**
 * Editor del detalle de servicio de un ítem (duración, modalidad, cobertura).
 * Solo se muestra para ítems de tipo servicio; el formulario hace upsert (PUT).
 */
export function ItemServiceDetails({
  storeId,
  itemId,
  detail,
  canManage,
}: {
  storeId: string;
  itemId: string;
  detail: ServiceDetail | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const durationId = useId();
  const modalityId = useId();
  const coverageId = useId();
  const notesId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modality, setModality] = useState<ServiceModality>(
    detail?.modality ?? 'in_store',
  );
  const base = `/v1/stores/${storeId}/items/${itemId}/service`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const duration = String(form.get('durationMin') ?? '').trim();
    const coverage = String(form.get('coverageKm') ?? '').trim();
    const notes = String(form.get('notes') ?? '').trim();
    const res = await fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        durationMin: duration ? Number(duration) : null,
        modality,
        coverageKm:
          modality === 'on_site' && coverage ? Number(coverage) : null,
        notes: notes || null,
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
    setError(data?.error ?? 'No se pudo guardar el detalle.');
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(base, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError('No se pudo borrar el detalle.');
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-foreground">Detalle de servicio</h2>

      {detail ? (
        <div className="glass flex items-center justify-between gap-3 rounded-lg p-3">
          <p className="text-muted-foreground text-sm">
            {MODALITY_LABELS[detail.modality]}
            {detail.durationMin ? ` · ${detail.durationMin} min` : ''}
            {detail.modality === 'on_site' && detail.coverageKm
              ? ` · radio ${detail.coverageKm} km`
              : ''}
            {detail.notes ? ` · ${detail.notes}` : ''}
          </p>
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={remove}
            >
              Borrar
            </Button>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Sin detalle de servicio todavía.
        </p>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {canManage && (
        <form
          onSubmit={onSubmit}
          className="glass max-w-md space-y-4 rounded-lg p-4"
        >
          <h3 className="font-medium text-foreground">
            {detail ? 'Editar detalle' : 'Agregar detalle'}
          </h3>

          <div className="space-y-1.5">
            <Label htmlFor={modalityId}>Modalidad</Label>
            <select
              id={modalityId}
              name="modality"
              className={fieldClass}
              value={modality}
              onChange={(e) => setModality(e.target.value as ServiceModality)}
            >
              <option value="in_store">En el local</option>
              <option value="on_site">A domicilio</option>
              <option value="remote">Remoto</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={durationId}>Duración (min)</Label>
              <Input
                id={durationId}
                name="durationMin"
                inputMode="numeric"
                defaultValue={detail?.durationMin ?? ''}
                placeholder="45"
              />
            </div>
            {modality === 'on_site' && (
              <div className="space-y-1.5">
                <Label htmlFor={coverageId}>Radio (km)</Label>
                <Input
                  id={coverageId}
                  name="coverageKm"
                  inputMode="numeric"
                  defaultValue={detail?.coverageKm ?? ''}
                  placeholder="10"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={notesId}>Notas (opcional)</Label>
            <Input
              id={notesId}
              name="notes"
              defaultValue={detail?.notes ?? ''}
              placeholder="Reservar con anticipación."
            />
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar detalle'}
          </Button>
        </form>
      )}
    </section>
  );
}
