'use client';

import { Button } from '@3b/ui';
import { useEffect, useState } from 'react';

// Estados del control de notificaciones push.
type State = 'loading' | 'unsupported' | 'denied' | 'off' | 'on';

/** Decodifica la clave pública VAPID (base64url) al ArrayBuffer que pide pushManager. */
function vapidKey(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buffer;
}

/**
 * Activa/desactiva Web Push en este dispositivo (M8d) y permite un envío de prueba.
 * Requiere el service worker registrado (en desarrollo está desactivado, así que
 * aparece como "no disponible"; funciona en la app instalada / build de producción).
 */
export function PushToggle() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      if (
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        if (!cancel) setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancel) setState('denied');
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        if (!cancel) setState('unsupported');
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (!cancel) setState(sub ? 'on' : 'off');
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setNote(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const res = await fetch('/v1/notifications/vapid-public-key');
      const { publicKey } = (await res.json()) as { publicKey: string };
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey(publicKey),
      });
      await fetch('/v1/notifications/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      setState('on');
    } catch {
      setNote('No se pudo activar. Intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/v1/notifications/subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
    } catch {
      setNote('No se pudo desactivar.');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/v1/notifications/test', { method: 'POST' });
      const data = (await res.json()) as { sent?: number };
      setNote(
        data.sent && data.sent > 0
          ? 'Te enviamos una notificación de prueba.'
          : 'No hay dispositivos suscriptos para notificar.',
      );
    } catch {
      setNote('No se pudo enviar la prueba.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') {
    return <p className="text-muted-foreground text-sm">Verificando…</p>;
  }
  if (state === 'unsupported') {
    return (
      <p className="text-muted-foreground text-sm">
        Las notificaciones no están disponibles en este navegador. Instalá 3B
        para activarlas.
      </p>
    );
  }
  if (state === 'denied') {
    return (
      <p className="text-muted-foreground text-sm">
        Bloqueaste las notificaciones. Habilitalas en los permisos del navegador
        para este sitio.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {state === 'off' ? (
        <Button type="button" size="sm" disabled={busy} onClick={enable}>
          {busy ? 'Activando…' : 'Activar notificaciones'}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground text-sm">
            Notificaciones activadas.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={test}
          >
            Enviar prueba
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={disable}
          >
            Desactivar
          </Button>
        </div>
      )}
      {note && <p className="text-muted-foreground text-sm">{note}</p>}
    </div>
  );
}
