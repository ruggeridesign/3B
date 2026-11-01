import type { PublicItem } from '@3b/contracts';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPublicItem } from '../../../../lib/catalog';
import { getMe } from '../../../../lib/me';

const MODALITY: Record<string, string> = {
  in_store: 'En el local',
  on_site: 'A domicilio',
  remote: 'Remoto',
};

function price(it: PublicItem): string {
  if (it.priceMode === 'quote' || !it.priceAmount) return 'A cotizar';
  const suffix = it.priceMode === 'from' ? ' (desde)' : '';
  return `${it.currency} ${it.priceAmount}${suffix}`;
}

export default async function ItemFicha({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect('/login');

  const { id } = await params;
  const it = await getPublicItem(id);
  if (!it) {
    return (
      <div className="space-y-4">
        <Link href="/comprar" className="text-muted-foreground text-sm">
          ← Comprar
        </Link>
        <p className="text-muted-foreground text-sm">
          No encontramos ese ítem o no está disponible.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/comprar" className="text-muted-foreground text-sm">
          ← Comprar
        </Link>
        <h1 className="font-bold text-2xl text-foreground">{it.title}</h1>
        <p className="text-muted-foreground text-sm">
          {it.storeName}
          {it.storeVerified && (
            <span className="ml-2 rounded-md bg-seller/20 px-1.5 py-0.5 text-foreground text-xs">
              Verificada
            </span>
          )}
          {it.communityName ? ` · ${it.communityName}` : ''}
        </p>
        <p className="font-medium text-foreground text-lg">{price(it)}</p>
      </div>

      {it.images.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {it.images.map((url) => (
            <li key={url}>
              {/* biome-ignore lint/performance/noImgElement: storage local de dev; next/image llega con el pulido visual */}
              <img
                src={url}
                alt=""
                className="h-40 w-40 rounded-md border border-border object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      {it.description && (
        <p className="max-w-prose text-foreground text-sm">{it.description}</p>
      )}

      {Object.keys(it.attributes).length > 0 && (
        <section className="space-y-1">
          <h2 className="font-medium text-foreground">Detalles</h2>
          <dl className="text-muted-foreground text-sm">
            {Object.entries(it.attributes).map(([k, v]) => (
              <div key={k} className="flex gap-1.5">
                <dt className="capitalize">{k.replace(/_/g, ' ')}:</dt>
                <dd className="text-foreground">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {it.serviceDetail && (
        <section className="space-y-1">
          <h2 className="font-medium text-foreground">Servicio</h2>
          <p className="text-muted-foreground text-sm">
            {MODALITY[it.serviceDetail.modality] ?? it.serviceDetail.modality}
            {it.serviceDetail.durationMin
              ? ` · ${it.serviceDetail.durationMin} min`
              : ''}
            {it.serviceDetail.modality === 'on_site' &&
            it.serviceDetail.coverageKm
              ? ` · radio ${it.serviceDetail.coverageKm} km`
              : ''}
          </p>
          {it.serviceDetail.notes && (
            <p className="text-muted-foreground text-sm">
              {it.serviceDetail.notes}
            </p>
          )}
        </section>
      )}

      {it.variants.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-foreground">Opciones</h2>
          <ul className="grid gap-2">
            {it.variants.map((v) => (
              <li
                key={v.id}
                className="glass flex items-center justify-between gap-3 rounded-lg p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{v.sku}</p>
                  <p className="text-muted-foreground text-sm">
                    {Object.entries(v.axisValues)
                      .map(([k, val]) => `${k}: ${val}`)
                      .join(' · ') || 'sin ejes'}
                    {v.priceAmount ? ` · ${it.currency} ${v.priceAmount}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-muted-foreground text-sm">
                  {v.available == null
                    ? 'sin control de stock'
                    : v.available > 0
                      ? `${v.available} disp.`
                      : 'agotado'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
