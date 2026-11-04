import { redirect } from 'next/navigation';
import {
  getPendingCollections,
  getStatementPayments,
} from '../../../lib/billing';
import { getCommunityKyc, getCommunityMetrics } from '../../../lib/community';
import { getMe } from '../../../lib/me';
import { getReports } from '../../../lib/social';
import { getStore } from '../../../lib/stores';
import {
  type Collection,
  CollectionsQueue,
} from '../../_components/collections-queue';
import { CommunityMetricsTiles } from '../../_components/community-metrics';
import {
  type KycReviewItem,
  KycReviewQueue,
} from '../../_components/kyc-review-queue';
import { ReportsQueue } from '../../_components/reports-queue';

/**
 * Panel de **comunidad** (M7d.1). Para admins de comunidad (`me.communities` con
 * `role='admin'`). Reúne, acotado por la RLS a la(s) comunidad(es) del admin: la cola
 * de **verificaciones** de tienda, los **cobros por confirmar** y los **reportes**
 * abiertos. El backend es el mismo que usa el admin de plataforma; la RLS hace el
 * alcance. El KYC + aprobación de Movers y las métricas llegan en M7d.2/M7d.3.
 */
export default async function Comunidad() {
  const me = await getMe();
  const adminCommunities = (me?.communities ?? []).filter(
    (c) => c.role === 'admin',
  );
  if (adminCommunities.length === 0) {
    redirect('/');
  }

  // Por comunidad: métricas + cola de verificaciones (tiendas con nombre + Movers).
  const byCommunity = await Promise.all(
    adminCommunities.map(async (community) => {
      const [metrics, submissions] = await Promise.all([
        getCommunityMetrics(community.id),
        getCommunityKyc(community.id),
      ]);
      const items: KycReviewItem[] = await Promise.all(
        submissions.map(async (submission) => {
          if (submission.subjectType === 'mover') {
            return { submission, label: 'Solicitud de Mover' };
          }
          const store = await getStore(submission.subjectId);
          return { submission, label: store?.name ?? 'Tienda' };
        }),
      );
      return { community, metrics, items };
    }),
  );

  // Cobros por confirmar (RLS-scoped a la comunidad del admin) + su comprobante.
  const pending = await getPendingCollections();
  const collections: Collection[] = await Promise.all(
    (pending?.statements ?? []).map(async (statement) => {
      const payments = await getStatementPayments(statement.id);
      const report =
        payments?.payments.find((p) => p.status === 'reported') ?? null;
      return { statement, report };
    }),
  );

  const reports = await getReports('open');

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl text-foreground">Comunidad</h1>
        <p className="text-muted-foreground text-sm">
          Panel del admin de {adminCommunities.map((c) => c.name).join(', ')}.
          Verificaciones, cobros y reportes de tu comunidad.
        </p>
      </div>

      {byCommunity.map(({ community, metrics, items }) => (
        <div key={community.id} className="space-y-4">
          {metrics && (
            <section className="space-y-2">
              <h2 className="font-medium text-foreground">{community.name}</h2>
              <CommunityMetricsTiles metrics={metrics} />
            </section>
          )}
          <section className="space-y-2">
            <h2 className="font-medium text-foreground">
              Verificaciones — {community.name}
              {items.length > 0 ? ` (${items.length})` : ''}
            </h2>
            <KycReviewQueue items={items} />
          </section>
        </div>
      ))}

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
