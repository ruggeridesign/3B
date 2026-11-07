'use client';

import type { KycDocType, KycSubmission, MeCommunity } from '@3b/contracts';
import { Button, cn, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { mutate } from '../../lib/mutate';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

const DOC_LABEL: Record<KycDocType, string> = {
  rif: 'RIF',
  cedula: 'Cédula',
  pasaporte: 'Pasaporte',
  other: 'Otro',
};

const STATUS_LABEL: Record<KycSubmission['status'], string> = {
  pending: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

/**
 * Postulación a **Mover** (M7d.2): el usuario elige una comunidad donde operar y envía
 * una verificación; el admin de esa comunidad la aprueba (→ pasás a ser Mover) o la
 * rechaza. Muestra el estado de sus solicitudes. Dispara
 * `POST /v1/me/mover/applications` y refresca.
 */
export function MoverApply({
  communities,
  applications,
}: {
  communities: MeCommunity[];
  applications: KycSubmission[];
}) {
  const router = useRouter();
  const communityId = useId();
  const docTypeId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const outcome = await mutate('/v1/me/mover/applications', {
      method: 'POST',
      body: {
        communityId: form.get('communityId'),
        docType: form.get('docType'),
      },
    });
    setBusy(false);
    if (outcome.status === 'error') {
      setError(outcome.message);
      return;
    }
    router.refresh();
  }

  const byCommunity = new Map(communities.map((c) => [c.id, c.name]));

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-medium text-foreground">Convertite en Mover</h2>
        <p className="text-muted-foreground text-sm">
          Enviá una verificación a la comunidad donde querés repartir. Cuando el
          admin la apruebe, vas a poder ofertar y hacer envíos.
        </p>
      </div>

      {applications.length > 0 && (
        <ul className="space-y-2">
          {applications.map((a) => (
            <li
              key={a.id}
              className="glass flex items-center justify-between gap-2 rounded-lg p-3 text-sm"
            >
              <span className="text-foreground">
                {byCommunity.get(a.communityId ?? '') ?? 'Comunidad'} ·{' '}
                {DOC_LABEL[a.docType]}
              </span>
              <span className="rounded-md bg-seller/20 px-1.5 py-0.5 text-xs">
                {STATUS_LABEL[a.status]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {communities.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Necesitás pertenecer a una comunidad para postularte.
        </p>
      ) : (
        <form onSubmit={apply} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={communityId}>Comunidad</Label>
            <select id={communityId} name="communityId" className={fieldClass}>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={docTypeId}>Documento</Label>
            <select id={docTypeId} name="docType" className={fieldClass}>
              {(Object.keys(DOC_LABEL) as KycDocType[]).map((d) => (
                <option key={d} value={d}>
                  {DOC_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar solicitud'}
          </Button>
        </form>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </section>
  );
}
