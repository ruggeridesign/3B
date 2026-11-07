import { Card, CardContent, CardHeader, CardTitle } from '@3b/ui';
import type { Metadata } from 'next';
import { OfflineRetry } from './offline-retry';

// Página de reserva que el service worker sirve cuando una navegación falla sin red
// (ver fallbacks en app/sw.ts). Es estática y se precachea en build, por eso vive
// fuera de (shell): el layout del shell hace getMe() (red) y redirige a /login.
export const metadata: Metadata = {
  title: 'Sin conexión',
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sin conexión</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            No pudimos cargar esta página porque estás sin conexión. Revisá tu
            red e intentá de nuevo; las páginas que ya visitaste siguen
            disponibles.
          </p>
          <OfflineRetry />
        </CardContent>
      </Card>
    </main>
  );
}
