import { redirect } from 'next/navigation';
import { getMe } from '../../../lib/me';
import { getOpenShipments } from '../../../lib/shipping';
import { MoverQueue } from '../../_components/mover-queue';

/**
 * Área del Mover. **M6a**: cola de solicitudes de envío abiertas en sus comunidades
 * + ofertar (precio + ETA). El viaje activo y las ganancias llegan en M6b/M6c.
 */
export default async function Mover() {
  const me = await getMe();
  if (!me?.capabilities.isMover) {
    redirect('/');
  }

  const shipments = await getOpenShipments();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl text-foreground">Mover</h1>
        <p className="text-muted-foreground text-sm">
          Solicitudes de envío abiertas en tus comunidades. Ofertá precio y
          tiempo estimado; el viaje activo llega pronto.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium text-foreground">
          Solicitudes abiertas
          {shipments.length > 0 ? ` (${shipments.length})` : ''}
        </h2>
        <MoverQueue shipments={shipments} />
      </section>
    </div>
  );
}
