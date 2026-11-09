import type { Metadata } from 'next';
import { PushToggle } from '../../_components/push-toggle';

export const metadata: Metadata = { title: 'Ajustes' };

export default function AjustesPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-semibold text-2xl text-foreground">Ajustes</h1>

      <section className="glass max-w-md space-y-3 rounded-lg p-4">
        <div>
          <h2 className="font-medium text-foreground">Notificaciones push</h2>
          <p className="text-muted-foreground text-sm">
            Recibí avisos de 3B en este dispositivo, incluso con la app cerrada.
          </p>
        </div>
        <PushToggle />
      </section>
    </div>
  );
}
