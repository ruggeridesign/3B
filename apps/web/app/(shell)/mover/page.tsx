import { redirect } from 'next/navigation';
import { getMyFeeAccruals, getMyStatements } from '../../../lib/billing';
import { getMe } from '../../../lib/me';
import { getAssignedShipments, getOpenShipments } from '../../../lib/shipping';
import { MoverQueue } from '../../_components/mover-queue';
import { MoverTrip } from '../../_components/mover-trip';
import { Statements } from '../../_components/statements';

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

  const [open, assigned, fees, statements] = await Promise.all([
    getOpenShipments(),
    getAssignedShipments(),
    getMyFeeAccruals(),
    getMyStatements(),
  ]);
  const activeTrips = assigned.filter(
    (s) => s.status !== 'entregado' && s.status !== 'fallido',
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl text-foreground">Mover</h1>
        <p className="text-muted-foreground text-sm">
          Ofertá en solicitudes abiertas y seguí tus viajes asignados.
        </p>
        {fees && Number(fees.total) > 0 && (
          <p className="text-muted-foreground text-sm">
            Comisiones devengadas: {fees.currency} {fees.total}
          </p>
        )}
      </div>

      {activeTrips.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-foreground">Mis viajes</h2>
          <MoverTrip trips={activeTrips} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium text-foreground">
          Solicitudes abiertas
          {open.length > 0 ? ` (${open.length})` : ''}
        </h2>
        <MoverQueue shipments={open} />
      </section>

      {statements && (
        <Statements statements={statements.statements} canReport />
      )}
    </div>
  );
}
