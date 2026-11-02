import type { DiscoveryItem } from '@3b/contracts';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPublicStore } from '../../../../../lib/catalog';
import { getMe } from '../../../../../lib/me';
import { getStoreReviews, stars } from '../../../../../lib/social';

// 0 = domingo … 6 = sábado; se muestran empezando por lunes.
const DAYS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function price(it: DiscoveryItem): string {
  if (it.priceMode === 'quote' || !it.priceAmount) return 'A cotizar';
  const suffix = it.priceMode === 'from' ? ' (desde)' : '';
  return `${it.currency} ${it.priceAmount}${suffix}`;
}

export default async function Storefront({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect('/login');

  const { id } = await params;
  const store = await getPublicStore(id);
  if (!store) {
    return (
      <div className="space-y-4">
        <Link href="/comprar" className="text-muted-foreground text-sm">
          ← Comprar
        </Link>
        <p className="text-muted-foreground text-sm">
          No encontramos esa tienda o no está disponible.
        </p>
      </div>
    );
  }

  const reviews = await getStoreReviews(id);

  const hoursByDay = new Map<number, string[]>();
  for (const h of store.hours) {
    const list = hoursByDay.get(h.weekday) ?? [];
    list.push(`${fmt(h.opensMin)}–${fmt(h.closesMin)}`);
    hoursByDay.set(h.weekday, list);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/comprar" className="text-muted-foreground text-sm">
          ← Comprar
        </Link>
        <h1 className="font-bold text-2xl text-foreground">
          {store.name}
          {store.verified && (
            <span className="ml-2 rounded-md bg-seller/20 px-1.5 py-0.5 align-middle text-foreground text-xs">
              Verificada
            </span>
          )}
        </h1>
        <p className="text-muted-foreground text-sm">
          {store.kind === 'products' ? 'Productos' : 'Servicios'}
          {store.communityName ? ` · ${store.communityName}` : ''}
        </p>
        {reviews && reviews.count > 0 && (
          <p className="text-sm">
            <span className="text-accent">{stars(reviews.average ?? 0)}</span>{' '}
            <span className="text-muted-foreground">
              {reviews.average} · {reviews.count}{' '}
              {reviews.count === 1 ? 'reseña' : 'reseñas'}
            </span>
          </p>
        )}
      </div>

      {store.hours.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-foreground">Horario</h2>
          <ul className="grid max-w-sm gap-1 text-sm">
            {DAY_ORDER.map((d) => (
              <li key={d} className="flex justify-between gap-3">
                <span className="text-foreground">{DAYS[d]}</span>
                <span className="text-muted-foreground">
                  {hoursByDay.get(d)?.join(', ') ?? 'Cerrado'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-medium text-foreground">Catálogo</h2>
        {store.items.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {store.items.map((it) => (
              <li key={it.id}>
                <Link
                  href={`/comprar/${it.id}`}
                  className="glass flex h-full flex-col gap-1 rounded-lg p-4 transition-colors hover:border-ring"
                >
                  <p className="font-medium text-foreground">{it.title}</p>
                  {it.description && (
                    <p className="line-clamp-2 text-muted-foreground text-sm">
                      {it.description}
                    </p>
                  )}
                  <p className="mt-1 font-medium text-foreground">
                    {price(it)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            Esta tienda todavía no publicó ítems.
          </p>
        )}
      </section>

      {reviews && reviews.reviews.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-foreground">Reseñas</h2>
          <ul className="space-y-2">
            {reviews.reviews.map((r) => (
              <li key={r.id} className="glass space-y-1 rounded-lg p-3">
                <p className="text-sm">
                  <span className="text-accent">
                    {'★★★★★'.slice(0, r.rating)}
                  </span>
                  <span className="text-muted-foreground">
                    {'☆☆☆☆☆'.slice(0, 5 - r.rating)}
                  </span>
                  {r.authorName && (
                    <span className="ml-2 text-muted-foreground text-xs">
                      {r.authorName}
                    </span>
                  )}
                </p>
                {r.body && <p className="text-foreground text-sm">{r.body}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
