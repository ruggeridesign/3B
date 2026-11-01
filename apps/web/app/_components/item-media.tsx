'use client';

import type { CreateMediaResponse, Media } from '@3b/contracts';
import { Button } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/** Imágenes de un ítem: galería + subida directa (dos fases) + borrar. */
export function ItemMedia({
  itemId,
  media,
  canManage,
}: {
  itemId: string;
  media: Media[];
  canManage: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setError(null);
    if (!ALLOWED.includes(file.type)) {
      setError('Formato no soportado (usá JPG, PNG, WebP o AVIF).');
      return;
    }
    setBusy(true);
    try {
      // Fase 1: crear la media pendiente + obtener el destino firmado.
      const createRes = await fetch('/v1/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerType: 'item',
          ownerId: itemId,
          mime: file.type,
        }),
      });
      if (!createRes.ok) throw new Error('No se pudo iniciar la subida.');
      const { media: created, upload: target } =
        (await createRes.json()) as CreateMediaResponse;

      // Fase 2: subir los bytes al destino firmado (cross-origin, con CORS).
      const putRes = await fetch(target.url, {
        method: target.method,
        headers: target.headers,
        body: file,
      });
      if (!putRes.ok) throw new Error('No se pudo subir el archivo.');

      // Fase 3: confirmar.
      await fetch(`/v1/media/${created.id}/complete`, { method: 'POST' });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al subir.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await fetch(`/v1/media/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError('No se pudo borrar la imagen.');
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-foreground">Imágenes</h2>

      {media.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {media.map((m) => (
            <li key={m.id} className="space-y-1">
              {/* biome-ignore lint/performance/noImgElement: storage local de dev; next/image llega con el pulido visual */}
              <img
                src={m.url}
                alt=""
                className="h-28 w-28 rounded-md border border-border object-cover"
              />
              {canManage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => remove(m.id)}
                >
                  Quitar
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Sin imágenes todavía.</p>
      )}

      {canManage && (
        <div className="space-y-1.5">
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED.join(',')}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
            className="block text-foreground text-sm"
          />
          {busy && <p className="text-muted-foreground text-sm">Subiendo…</p>}
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </section>
  );
}
