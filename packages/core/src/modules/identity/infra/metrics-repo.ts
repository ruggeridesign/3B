import type { CommunityMetrics } from '@3b/contracts';
import { type AppTransaction, sql } from '@3b/db';

type MetricsRow = {
  stores: number | string;
  movers: number | string;
  orders: number | string;
  gmv: string;
  pending_collections: number | string;
  open_reports: number | string;
};

/**
 * Métricas de una comunidad (M7d.3). Delega en la función definer auto-guardada
 * `identity.community_metrics`: agrega conteos a través de esquemas bypasseando RLS,
 * pero solo devuelve filas si el que consulta es admin de la comunidad (o de
 * plataforma). Sin filas → `null` (sin acceso).
 */
export async function getCommunityMetrics(
  db: AppTransaction,
  communityId: string,
): Promise<CommunityMetrics | null> {
  const rows = (await db.execute(
    sql`SELECT * FROM identity.community_metrics(${communityId})`,
  )) as unknown as MetricsRow[];
  const r = rows[0];
  if (!r) return null;
  return {
    stores: Number(r.stores),
    movers: Number(r.movers),
    orders: Number(r.orders),
    gmv: Number(r.gmv).toFixed(2),
    pendingCollections: Number(r.pending_collections),
    openReports: Number(r.open_reports),
  };
}
