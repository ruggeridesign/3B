'use client';

import { Button } from '@3b/ui';

// Reintenta la navegación recargando la página actual. Al volver la red, el SW sirve
// la versión real en vez de la página offline.
export function OfflineRetry() {
  return (
    <Button
      type="button"
      onClick={() => {
        window.location.reload();
      }}
    >
      Reintentar
    </Button>
  );
}
