import { redirect } from 'next/navigation';
import { getMe } from '../../../lib/me';
import { getReports } from '../../../lib/social';
import { ReportsQueue } from '../../_components/reports-queue';

/**
 * Admin de plataforma. **M5d.4**: cola de moderación (reportes abiertos). La RLS
 * acota lo visible; resolver exige ser admin de la comunidad o de plataforma.
 */
export default async function Admin() {
  const me = await getMe();
  if (!me?.capabilities.isPlatformAdmin) {
    redirect('/');
  }

  const reports = await getReports('open');

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl text-foreground">Admin</h1>
        <p className="text-muted-foreground text-sm">
          Moderación de contenido (admin de plataforma). Verificaciones,
          comunidades y auditoría llegan más adelante.
        </p>
      </div>

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
