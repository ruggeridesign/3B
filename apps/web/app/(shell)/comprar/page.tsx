import { redirect } from 'next/navigation';
import { getDiscoveryItems } from '../../../lib/catalog';
import { getMe } from '../../../lib/me';
import { DiscoverySearch } from '../../_components/discovery-search';

const PRICE_MODE_SUFFIX: Record<string, string> = {
  from: ' (desde)',
  quote: '',
  fixed: '',
};

export default async function Comprar({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect('/login');

  const { q = '', kind = '' } = await searchParams;
  const { items } = await getDiscoveryItems({ q, kind });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-bold text-2xl text-foreground">Comprar</h1>
        <p className="text-muted-foreground text-sm">
          Explorá ítems publicados en tus comunidades.
        </p>
      </div>

      <DiscoverySearch initialQ={q} initialKind={kind} />

      {items.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <li
              key={it.id}
              className="glass flex flex-col gap-1 rounded-lg p-4"
            >
              <p className="font-medium text-foreground">{it.title}</p>
              <p className="text-muted-foreground text-sm">
                {it.storeName}
                {it.communityName ? ` · ${it.communityName}` : ''}
              </p>
              {it.description && (
                <p className="line-clamp-2 text-muted-foreground text-sm">
                  {it.description}
                </p>
              )}
              <p className="mt-1 font-medium text-foreground">
                {it.priceMode === 'quote' || !it.priceAmount
                  ? 'A cotizar'
                  : `${it.currency} ${it.priceAmount}${PRICE_MODE_SUFFIX[it.priceMode] ?? ''}`}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          {q
            ? `No encontramos ítems para “${q}”.`
            : 'Todavía no hay ítems publicados para mostrar.'}
        </p>
      )}
    </div>
  );
}
