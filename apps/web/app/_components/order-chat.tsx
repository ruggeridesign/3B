'use client';

import type { Message } from '@3b/contracts';
import { Button, cn, Input } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Hilo de chat del pedido (M5d.1). Muestra los mensajes (los míos a la derecha)
 * y un formulario para enviar. Al montar, marca como leídos los entrantes. Enviar
 * dispara `POST /v1/orders/{id}/messages` y refresca; marcar leído es
 * `POST /v1/orders/{id}/conversation/read`. El `meId` decide la alineación y el
 * recibo de lectura ("Visto") sobre mi último mensaje.
 */
export function OrderChat({
  orderId,
  messages,
  meId,
}: {
  orderId: string;
  messages: Message[];
  meId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Marcar como leídos los mensajes entrantes al abrir el hilo (una vez).
  useEffect(() => {
    const hasIncomingUnread = messages.some(
      (m) => m.senderId !== meId && !m.readAt,
    );
    if (!hasIncomingUnread) return;
    fetch(`/v1/orders/${orderId}/conversation/read`, { method: 'POST' }).catch(
      () => {},
    );
  }, [orderId, meId, messages]);

  // Último mensaje mío (para el recibo de lectura).
  const myLast = [...messages].reverse().find((m) => m.senderId === meId);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const body = String(form.get('body') ?? '').trim();
    if (!body) return;
    setBusy(true);
    const res = await fetch(`/v1/orders/${orderId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    setBusy(false);
    if (res.ok) {
      formRef.current?.reset();
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo enviar el mensaje.');
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-foreground">Chat</h2>

      {messages.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no hay mensajes. Escribí para iniciar la conversación.
        </p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => {
            const mine = m.senderId === meId;
            return (
              <li
                key={m.id}
                className={cn('flex', mine ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3 py-2',
                    mine ? 'bg-mover/15' : 'glass',
                  )}
                >
                  <p className="whitespace-pre-wrap break-words text-foreground text-sm">
                    {m.body}
                  </p>
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    {fmtTime(m.createdAt)}
                    {mine && m.id === myLast?.id && m.readAt ? ' · Visto' : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form ref={formRef} onSubmit={send} className="flex items-end gap-2">
        <Input
          name="body"
          placeholder="Escribí un mensaje…"
          maxLength={2000}
          autoComplete="off"
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Enviando…' : 'Enviar'}
        </Button>
      </form>

      {error && <p className="text-destructive text-sm">{error}</p>}
    </section>
  );
}
