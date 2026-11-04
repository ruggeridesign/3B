import { redirect } from 'next/navigation';
import {
  getPendingCollections,
  getStatementPayments,
} from '../../../lib/billing';
import { getMe } from '../../../lib/me';
import { getReports } from '../../../lib/social';
import {
  type Collection,
  CollectionsQueue,
} from '../../_components/collections-queue';
import { ReportsQueue } from '../../_components/reports-queue';

/**
 * Admin de plataforma. **M5d.4**: cola de moderación (reportes abiertos). **M7c.2**:
 * cobros por confirmar (estados de cuenta `pending` con su comprobante). La RLS acota lo
 * visible; resolver/confirmar exige ser admin de la comunidad o de plataforma.
 */
export default async function Admin() {
  const me = await getMe();
  if (!me?.capabilities.isPlatformAdmin) {
    redirect('/');
  }

  const [reports, pending] = await Promise.all([
    getReports('open'),
    getPendingCollections(),
  ]);

  // Por cada estado de cuenta pendiente, su comprobante reportado (el a revisar).
  const collections: Collection[] = await Promise.all(
    (pending?.statements ?? []).map(async (statement) => {
      const payments = await getStatementPayments(statement.id);
      const report =
        payments?.payments.find((p) => p.status === 'reported') ?? null;
      return { statement, report };
    }),
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl text-foreground">Admin</h1>
        <p className="text-muted-foreground text-sm">
          Moderación de contenido y cobros (admin de plataforma).
          Verificaciones, comunidades y auditoría llegan más adelante.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium text-foreground">
          Cobros por confirmar
          {collections.length > 0 ? ` (${collections.length})` : ''}
        </h2>
        <CollectionsQueue collections={collections} />
      </section>

      <section className="space-y-2">
        <h2 className="font-medium text-foreground">
          Reportes abiertos
          {reports.length > 0 ? ` (${reports.length})` : ''}
        </h2>
        <ReportsQueue reports={reports} />
      </section>
    </div>
  );
}
