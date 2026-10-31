import { redirect } from 'next/navigation';
import { getMe } from '../../../lib/me';
import { getMyStores } from '../../../lib/stores';
import { CreateStore } from '../../_components/create-store';

export default async function MiTienda() {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const stores = await getMyStores();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-bold text-2xl text-foreground">Mi Tienda</h1>
        <p className="text-muted-foreground text-sm">
          Abrí y gestioná tus tiendas. Al abrir tu primera tienda obtenés la
          capacidad de Seller.
        </p>
      </header>

      {stores.length > 0 ? (
        <ul className="grid gap-3">
          {stores.map((s) => (
            <li key={s.id} className="glass rounded-lg p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {s.kind === 'products' ? 'Productos' : 'Servicios'} · /
                    {s.slug}
                  </p>
                </div>
                <span className="text-muted-foreground text-xs">
                  {s.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          Todavía no tenés ninguna tienda.
        </p>
      )}

      <CreateStore communities={me.communities} />
    </div>
  );
}
