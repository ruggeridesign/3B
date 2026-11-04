import { redirect } from 'next/navigation';
import { getMyFeeAccruals, getMyStatements } from '../../../lib/billing';
import { getMyMoverApplications } from '../../../lib/community';
import { getMe } from '../../../lib/me';
import { getAssignedShipments, getOpenShipments } from '../../../lib/shipping';
import { MoverApply } from '../../_components/mover-apply';
import { MoverQueue } from '../../_components/mover-queue';
import { MoverTrip } from '../../_components/mover-trip';
import { Statements } from '../../_components/statements';

/**
 * Área del Mover. **M6a/M6b**: cola de solicitudes abiertas en sus comunidades
 * (ofertar) + sus **viajes asignados**; rastreo en vivo y entrega con PIN (M6c). Si el
 * usuario **aún no es Mover** (M7d.2), muestra la postulación por comunidad.
 */
export default async function Mover() {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }

  // Aún no es Mover: ofrecer la postulación (y el estado de sus solicitudes).
  if (!me.capabilities.isMover) {
    const applications = await getMyMoverApplications();
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-bold text-2xl text-foreground">Mover</h1>
          <p className="text-muted-foreground text-sm">
            Repartí en tu comunidad y ganá por cada envío.
          </p>
        </div>
        <MoverApply communities={me.communities} applications={applications} />
      </div>
    );
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
