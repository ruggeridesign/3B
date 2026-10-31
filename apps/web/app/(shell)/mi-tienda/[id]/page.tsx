import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '../../../../lib/me';
import { getStore, getStoreMembers } from '../../../../lib/stores';
import { StoreTeam } from '../../../_components/store-team';

export default async function StoreDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }

  const store = await getStore(id);
  if (!store) {
    return (
      <div className="space-y-4">
        <Link href="/mi-tienda" className="text-muted-foreground text-sm">
          ← Mis tiendas
        </Link>
        <p className="text-muted-foreground text-sm">
          No encontramos esa tienda o no tenés acceso.
        </p>
      </div>
    );
  }

  const members = await getStoreMembers(id);
  // El rol del usuario en ESTA tienda define si ve los controles de gestión.
  // La API gatea igual; esto solo decide qué mostramos.
  const myRole = me.stores.find((s) => s.id === id)?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/mi-tienda" className="text-muted-foreground text-sm">
          ← Mis tiendas
        </Link>
        <h1 className="font-bold text-2xl text-foreground">{store.name}</h1>
        <p className="text-muted-foreground text-sm">
          {store.kind === 'products' ? 'Productos' : 'Servicios'} · /
          {store.slug}
        </p>
      </div>

      <StoreTeam
        storeId={store.id}
        ownerId={store.ownerId}
        members={members}
        canManage={canManage}
      />
    </div>
  );
}
