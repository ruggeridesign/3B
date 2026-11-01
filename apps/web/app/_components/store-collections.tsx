'use client';

import type { Collection, Item } from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

/**
 * Colecciones (vitrina) de una tienda: lista con sus ítems + alta de colección y
 * de ítems (eligiendo del catálogo). Los controles requieren `canManage`.
 */
export function StoreCollections({
  storeId,
  collections,
  items,
  canManage,
}: {
  storeId: string;
  collections: Collection[];
  items: Item[];
  canManage: boolean;
}) {
  const router = useRouter();
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/v1/stores/${storeId}/collections`;
  const titleOf = (itemId: string) =>
    items.find((i) => i.id === itemId)?.title ?? itemId;

  async function mutate(path: string, init: RequestInit, fallback: string) {
    setError(null);
    setBusy(true);
    const res = await fetch(`${base}${path}`, init);
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return true;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? fallback);
    return false;
  }

  async function createCollection(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const ok = await mutate(
      '',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.get('title') }),
      },
      'No se pudo crear la colección.',
    );
    if (ok) (e.target as HTMLFormElement).reset();
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-foreground">Colecciones</h2>

      {collections.length > 0 ? (
        <ul className="grid gap-2">
          {collections.map((col) => (
            <li key={col.id} className="glass space-y-2 rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground">{col.title}</p>
                {canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        `/${col.id}`,
                        { method: 'DELETE' },
                        'No se pudo borrar la colección.',
                      )
                    }
                  >
                    Borrar
                  </Button>
                )}
              </div>

              {col.items.length > 0 ? (
                <ul className="grid gap-1">
                  {col.items.map((ref) => (
                    <li
                      key={ref.itemId}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {titleOf(ref.itemId)}
                      </span>
                      {canManage && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            mutate(
                              `/${col.id}/items/${ref.itemId}`,
                              { method: 'DELETE' },
                              'No se pudo quitar el ítem.',
                            )
                          }
                          className="text-destructive text-xs hover:underline"
                        >
                          Quitar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">Sin ítems.</p>
              )}

              {canManage && (
                <AddItem
                  collectionId={col.id}
                  items={items.filter(
                    (i) => !col.items.some((r) => r.itemId === i.id),
                  )}
                  onAdd={(itemId) =>
                    mutate(
                      `/${col.id}/items`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ itemId }),
                      },
                      'No se pudo agregar el ítem.',
                    )
                  }
                  busy={busy}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          Sin colecciones todavía.
        </p>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {canManage && (
        <form
          onSubmit={createCollection}
          className="glass flex max-w-md items-end gap-3 rounded-lg p-4"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={titleId}>Nueva colección</Label>
            <Input
              id={titleId}
              name="title"
              required
              minLength={2}
              placeholder="Destacados"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Creando…' : 'Crear'}
          </Button>
        </form>
      )}
    </section>
  );
}

/** Selector para agregar un ítem (de los que aún no están) a la colección. */
function AddItem({
  collectionId,
  items,
  onAdd,
  busy,
}: {
  collectionId: string;
  items: Item[];
  onAdd: (itemId: string) => void;
  busy: boolean;
}) {
  const id = useId();
  const [itemId, setItemId] = useState('');
  if (items.length === 0) return null;
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor={`${id}-${collectionId}`} className="sr-only">
          Agregar ítem
        </Label>
        <select
          id={`${id}-${collectionId}`}
          className={fieldClass}
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
        >
          <option value="">Agregar ítem…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy || !itemId}
        onClick={() => {
          if (itemId) {
            onAdd(itemId);
            setItemId('');
          }
        }}
      >
        Agregar
      </Button>
    </div>
  );
}
