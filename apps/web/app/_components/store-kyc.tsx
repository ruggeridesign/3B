'use client';

import type {
  CreateMediaResponse,
  KycDocType,
  KycSubmission,
  StoreVerificationLevel,
} from '@3b/contracts';
import { Button, cn, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

const DOC_LABELS: Record<KycDocType, string> = {
  rif: 'RIF',
  cedula: 'Cédula',
  pasaporte: 'Pasaporte',
  other: 'Otro',
};
const STATUS_LABELS: Record<KycSubmission['status'], string> = {
  pending: 'Pendiente de revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};
const DOC_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/**
 * Verificación (KYC) de la tienda: muestra el nivel actual, el historial de
 * verificaciones y un formulario para enviar una (documento opcional). Solo
 * managers (owner/admin).
 */
export function StoreKyc({
  storeId,
  verificationLevel,
  submissions,
  canManage,
}: {
  storeId: string;
  verificationLevel: StoreVerificationLevel;
  submissions: KycSubmission[];
  canManage: boolean;
}) {
  const router = useRouter();
  const docTypeId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<KycDocType>('rif');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Sube el documento (dos fases, owner_type=store) y devuelve su mediaId.
  async function uploadDoc(file: File): Promise<string> {
    const createRes = await fetch('/v1/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerType: 'store',
        ownerId: storeId,
        mime: file.type,
      }),
    });
    if (!createRes.ok) throw new Error('No se pudo iniciar la subida.');
    const { media, upload } = (await createRes.json()) as CreateMediaResponse;
    const putRes = await fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body: file,
    });
    if (!putRes.ok) throw new Error('No se pudo subir el documento.');
    await fetch(`/v1/media/${media.id}/complete`, { method: 'POST' });
    return media.id;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const file = inputRef.current?.files?.[0];
      if (file && !DOC_MIMES.includes(file.type)) {
        throw new Error('Documento: usá JPG, PNG, WebP o PDF.');
      }
      const mediaId = file ? await uploadDoc(file) : null;
      const res = await fetch(`/v1/stores/${storeId}/kyc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType, mediaId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? 'No se pudo enviar la verificación.');
      }
      if (inputRef.current) inputRef.current.value = '';
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-medium text-foreground">Verificación (KYC)</h2>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-xs',
            verificationLevel === 'verified'
              ? 'bg-seller/20 text-foreground'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {verificationLevel === 'verified' ? 'Verificada' : 'Sin verificar'}
        </span>
      </div>

      {submissions.length > 0 ? (
        <ul className="grid gap-2">
          {submissions.map((sub) => (
            <li
              key={sub.id}
              className="glass flex items-start justify-between gap-3 rounded-lg p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm">
                  {DOC_LABELS[sub.docType]} · {STATUS_LABELS[sub.status]}
                </p>
                {sub.reviewNotes && (
                  <p className="text-muted-foreground text-sm">
                    {sub.reviewNotes}
                  </p>
                )}
              </div>
              {sub.mediaId && (
                <a
                  href={`/v1/media/${sub.mediaId}`}
                  className="shrink-0 text-muted-foreground text-xs hover:underline"
                >
                  documento
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          Todavía no enviaste una verificación.
        </p>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {canManage && (
        <form
          onSubmit={onSubmit}
          className="glass max-w-md space-y-4 rounded-lg p-4"
        >
          <h3 className="font-medium text-foreground">Enviar verificación</h3>
          <div className="space-y-1.5">
            <Label htmlFor={docTypeId}>Tipo de documento</Label>
            <select
              id={docTypeId}
              className={fieldClass}
              value={docType}
              onChange={(e) => setDocType(e.target.value as KycDocType)}
            >
              {(Object.keys(DOC_LABELS) as KycDocType[]).map((t) => (
                <option key={t} value={t}>
                  {DOC_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${docTypeId}-file`}>Documento (opcional)</Label>
            <input
              ref={inputRef}
              id={`${docTypeId}-file`}
              type="file"
              accept={DOC_MIMES.join(',')}
              disabled={busy}
              className="block text-foreground text-sm"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar verificación'}
          </Button>
        </form>
      )}
    </section>
  );
}
