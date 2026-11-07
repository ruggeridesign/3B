'use client';

import type { Question } from '@3b/contracts';
import { Button, Input } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { mutate } from '../../lib/mutate';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Preguntas y respuestas públicas de un ítem (M5d.3). Cualquiera logueado que ve
 * el ítem pregunta; la tienda responde (`isStoreMember`). Preguntar dispara
 * `POST /v1/items/{id}/questions`; responder, `POST /v1/questions/{id}/answer`.
 */
export function ItemQuestions({
  itemId,
  questions,
  isStoreMember,
}: {
  itemId: string;
  questions: Question[];
  isStoreMember: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const askRef = useRef<HTMLFormElement>(null);

  async function ask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const body = String(new FormData(e.currentTarget).get('body') ?? '').trim();
    if (body.length < 3) return;
    setBusy(true);
    const outcome = await mutate(`/v1/items/${itemId}/questions`, {
      method: 'POST',
      body: { body },
    });
    setBusy(false);
    if (outcome.status === 'error') {
      setError(outcome.message);
      return;
    }
    // ok o queued (el toast global avisa si quedó encolada)
    askRef.current?.reset();
    router.refresh();
  }

  async function answer(e: React.FormEvent<HTMLFormElement>, qId: string) {
    e.preventDefault();
    setError(null);
    const value = String(
      new FormData(e.currentTarget).get('answer') ?? '',
    ).trim();
    if (!value) return;
    setBusy(true);
    const outcome = await mutate(`/v1/questions/${qId}/answer`, {
      method: 'POST',
      body: { answer: value },
    });
    setBusy(false);
    if (outcome.status === 'error') {
      setError(outcome.message);
      return;
    }
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-foreground">Preguntas</h2>

      <form ref={askRef} onSubmit={ask} className="flex items-end gap-2">
        <Input
          name="body"
          placeholder="Preguntá sobre este ítem…"
          minLength={3}
          maxLength={1000}
          autoComplete="off"
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={busy}>
          Preguntar
        </Button>
      </form>

      {questions.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no hay preguntas.
        </p>
      ) : (
        <ul className="space-y-3">
          {questions.map((q) => (
            <li key={q.id} className="glass space-y-2 rounded-lg p-3">
              <div>
                <p className="text-foreground text-sm">{q.body}</p>
                <p className="text-muted-foreground text-xs">
                  {q.authorName ?? 'Alguien'} · {fmtDate(q.createdAt)}
                </p>
              </div>
              {q.answer ? (
                <div className="border-border border-l-2 pl-3">
                  <p className="text-foreground text-sm">{q.answer}</p>
                  <p className="text-muted-foreground text-xs">
                    Respuesta de la tienda
                    {q.answeredAt ? ` · ${fmtDate(q.answeredAt)}` : ''}
                  </p>
                </div>
              ) : (
                isStoreMember && (
                  <form
                    onSubmit={(e) => answer(e, q.id)}
                    className="flex items-end gap-2"
                  >
                    <Input
                      name="answer"
                      placeholder="Responder…"
                      maxLength={2000}
                      autoComplete="off"
                      className="flex-1"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                    >
                      Responder
                    </Button>
                  </form>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </section>
  );
}
