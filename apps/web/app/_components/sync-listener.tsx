'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Escucha el aviso del service worker cuando reenvía las mutaciones encoladas
// (Background Sync, M8c) y refresca la vista para reflejar los cambios ya aplicados
// en el server. No renderiza nada.
export function SyncListener() {
  const router = useRouter();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === 'mutations-synced') {
        router.refresh();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [router]);

  return null;
}
