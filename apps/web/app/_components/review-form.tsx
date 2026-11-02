'use client';

import type { Review } from '@3b/contracts';
import { Button, cn, Input } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Reseña de la tienda en un pedido `completado` (M5d.2). Si el comprador ya
 * reseñó, se muestra su reseña en modo lectura; si no, un selector de estrellas
 * (1–5) + comentario opcional que dispara `POST /v1/orders/{id}/reviews`.
 */
export function ReviewForm({
  orderId,
  review,
  canReview,
}: {
  orderId: string;
  review: Review | null;
  canReview: boolean;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!review && !canReview) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const body = String(form.get('body') ?? '').trim();
    setBusy(true);
    const res = await fetch(`/v1/orders/${orderId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, body: body || undefined }),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo enviar la reseña.');
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-foreground">Reseña</h2>

      {review ? (
        <div className="glass space-y-1 rounded-lg p-3">
          <p className="text-accent text-sm">
            <span className="sr-only">{review.rating} de 5</span>
            <span aria-hidden="true">
              {'★★★★★'.slice(0, review.rating)}
              <span className="text-muted-foreground">
                {'☆☆☆☆☆'.slice(0, 5 - review.rating)}
              </span>
            </span>
          </p>
          {review.body && (
            <p className="text-foreground text-sm">{review.body}</p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <p className="text-muted-foreground text-sm">
            ¿Cómo fue tu experiencia con la tienda?
          </p>
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">Calificación (1 a 5 estrellas)</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                className={cn(
                  'cursor-pointer rounded-md px-1 text-2xl transition-colors',
                  'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring',
                  n <= rating ? 'text-accent' : 'text-muted-foreground',
                )}
              >
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  className="sr-only"
                />
                <span aria-hidden="true">{n <= rating ? '★' : '☆'}</span>
                <span className="sr-only">
                  {n} {n === 1 ? 'estrella' : 'estrellas'}
                </span>
              </label>
            ))}
          </fieldset>
          <Input
            name="body"
            placeholder="Contanos algo (opcional)"
            maxLength={1000}
            autoComplete="off"
          />
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar reseña'}
          </Button>
        </form>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </section>
  );
}
