import type { CommunityMetrics } from '@3b/contracts';

/** Una métrica (rótulo + valor) del tablero de comunidad. */
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-lg p-3">
      <p className="font-bold text-2xl text-foreground">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

/**
 * Tablero de métricas de una comunidad (M7d.3): conteos de tiendas, Movers, pedidos,
 * GMV (ventas completadas), cobros pendientes y reportes abiertos. Presentacional.
 */
export function CommunityMetricsTiles({
  metrics,
}: {
  metrics: CommunityMetrics;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Tile label="Tiendas" value={String(metrics.stores)} />
      <Tile label="Movers" value={String(metrics.movers)} />
      <Tile label="Pedidos" value={String(metrics.orders)} />
      <Tile label="GMV (USD)" value={metrics.gmv} />
      <Tile
        label="Cobros pendientes"
        value={String(metrics.pendingCollections)}
      />
      <Tile label="Reportes abiertos" value={String(metrics.openReports)} />
    </div>
  );
}
