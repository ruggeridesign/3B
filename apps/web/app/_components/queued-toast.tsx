'use client';

import { useEffect, useState } from 'react';
import { MUTATION_QUEUED_EVENT } from '../../lib/mutate';

// Aviso global (M8c.2): cuando una mutación queda encolada offline (ver lib/mutate),
// se muestra un toast efímero en vez de que cada componente repita el mensaje. Vidrio
// esmerilado (superficie emergente), entra/sale con los tokens de motion y se
// autodismiss a los ~4 s.
export function QueuedToast() {
  const [visible, setVisible] = useState(false);
  // El mensaje queda seteado (no se limpia) para que el texto siga durante el fade-out.
  const [message, setMessage] = useState('');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onQueued = () => {
      setMessage('Guardado sin conexión — se enviará al reconectar.');
      setVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 4000);
    };
    window.addEventListener(MUTATION_QUEUED_EVENT, onQueued);
    return () => {
      window.removeEventListener(MUTATION_QUEUED_EVENT, onQueued);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      data-visible={visible}
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex translate-y-2 justify-center px-4 opacity-0 transition-all duration-[var(--duration-base)] ease-standard data-[visible=true]:translate-y-0 data-[visible=true]:opacity-100"
    >
      {message && (
        <p className="glass rounded-lg px-4 py-2 text-foreground text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
