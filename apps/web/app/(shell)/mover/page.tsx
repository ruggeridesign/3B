import { redirect } from 'next/navigation';
import { getMe } from '../../../lib/me';
import {
  getAssignedShipments,
  getOpenShipments,
  SHIPMENT_STATUS_LABEL,
} from '../../../lib/shipping';
import { MoverQueue } from '../../_components/mover-queue';

/**
 * Área del Mover. **M6a/M6b**: cola de solicitudes abiertas en sus comunidades
 * (ofertar) + sus **viajes asignados**. El rastreo en vivo y la entrega con PIN
 * llegan en M6c.
 */
export default async function Mover() {
  const me = await getMe();
  if (!me?.capabilities.isMover) {
    redirect('/');
  }

  const [open, assigned] = await Promise.all([
    getOpenShipments(),
    getAssignedShipments(),
  ]);
  const activeTrips = assigned.filter(
    (s) => s.status !== 'entregado' && s.status !== 'fallido',
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl text-foreground">Mover</h1>
        <p className="text-muted-foreground text-sm">
          Ofertá en solicitudes abiertas y seguí tus viajes asignados. El
          rastreo en vivo llega pronto.
        </p>
      </div>

      {activeTrips.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-foreground">Mis viajes</h2>
          <ul className="space-y-2">
            {activeTrips.map((s) => (
              <li key={s.id} className="glass space-y-0.5 rounded-lg p-4">
                <p className="font-medium text-foreground text-sm">
                  {s.originRef ?? 'Origen'} → {s.destRef ?? 'Destino'}
                  <span className="ml-2 rounded-md bg-mover/20 px-1.5 py-0.5 align-middle text-foreground text-xs">
                    {SHIPMENT_STATUS_LABEL[s.status]}
                  </span>
                </p>
                {s.agreedPrice && (
                  <p className="text-muted-foreground text-xs">
                    Acordado: USD {s.agreedPrice}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium text-foreground">
          Solicitudes abiertas
          {open.length > 0 ? ` (${open.length})` : ''}
        </h2>
        <MoverQueue shipments={open} />
      </section>
    </div>
  );
}
