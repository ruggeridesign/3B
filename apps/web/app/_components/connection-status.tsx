'use client';

import { useEffect, useState } from 'react';

// Indicador de conexión (M8b): barra fina que aparece cuando el navegador queda sin
// red. Avisa que los datos pueden venir de la caché del SW y que las acciones que
// escriben pueden fallar. Entra/sale con los tokens de motion (no instantáneo).
export function ConnectionStatus() {
  // Asumimos online en el primer render (SSR) para no parpadear; corregimos en el
  // efecto con el estado real del navegador.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    // Truco de animación de alto: grid-rows 0fr → 1fr con overflow-hidden.
    <div
      aria-hidden={!offline}
      data-visible={offline}
      className="grid grid-rows-[0fr] transition-all duration-[var(--duration-base)] ease-standard data-[visible=true]:grid-rows-[1fr]"
    >
      <div className="overflow-hidden">
        {/* Región viva: el texto cambia al pasar a offline, así se anuncia. */}
        <p
          aria-live="polite"
          className="bg-accent px-4 py-1.5 text-center text-accent-foreground text-sm"
        >
          {offline ? 'Sin conexión — estás viendo datos guardados.' : ''}
        </p>
      </div>
    </div>
  );
}
