import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getItemMedia,
  getItemServiceDetail,
  getItemStock,
  getItemVariants,
  getResolvedAttributes,
} from '../../../../../../lib/catalog';
import { getMe } from '../../../../../../lib/me';
import { getStore, getStoreItems } from '../../../../../../lib/stores';
import { ItemMedia } from '../../../../../_components/item-media';
import { ItemServiceDetails } from '../../../../../_components/item-service-details';
import { ItemStock } from '../../../../../_components/item-stock';
import { ItemVariants } from '../../../../../_components/item-variants';

export default async function ItemDetail({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }

  const [store, items] = await Promise.all([getStore(id), getStoreItems(id)]);
  const item = items.find((i) => i.id === itemId);
  if (!store || !item) {
    return (
      <div className="space-y-4">
        <Link
          href={`/mi-tienda/${id}`}
          className="text-muted-foreground text-sm"
        >
          ← Volver a la tienda
        </Link>
        <p className="text-muted-foreground text-sm">
          No encontramos ese ítem o no tenés acceso.
        </p>
      </div>
    );
  }

  const myRole = me.stores.find((s) => s.id === id)?.role;
  const canManage =
    myRole === 'owner' || myRole === 'admin' || myRole === 'catalog';

  const [media, variants, resolved, serviceDetail, stock] = await Promise.all([
    getItemMedia(itemId),
    getItemVariants(id, itemId),
    getResolvedAttributes(id, item.categoryId ?? undefined),
    item.kind === 'service'
      ? getItemServiceDetail(id, itemId)
      : Promise.resolve(null),
    item.kind === 'product' ? getItemStock(id, itemId) : Promise.resolve([]),
  ]);
  const axes = resolved.filter((a) => a.variantAxis);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href={`/mi-tienda/${id}`}
          className="text-muted-foreground text-sm"
        >
          ← {store.name}
        </Link>
        <h1 className="font-bold text-2xl text-foreground">{item.title}</h1>
        <p className="text-muted-foreground text-sm">
          {item.kind === 'product' ? 'Producto' : 'Servicio'} · {item.status} ·
          /{item.slug}
        </p>
        {Object.keys(item.attributes).length > 0 && (
          <p className="text-muted-foreground text-sm">
            {Object.entries(item.attributes)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' · ')}
          </p>
        )}
      </div>

      <ItemMedia itemId={item.id} media={media} canManage={canManage} />

      {item.kind === 'service' && (
        <ItemServiceDetails
          storeId={id}
          itemId={item.id}
          detail={serviceDetail}
          canManage={canManage}
        />
      )}

      <ItemVariants
        storeId={id}
        itemId={item.id}
        variants={variants}
        axes={axes}
        canManage={canManage}
      />

      {item.kind === 'product' && (
        <ItemStock
          storeId={id}
          itemId={item.id}
          variants={variants}
          levels={stock}
          canManage={canManage}
        />
      )}
    </div>
  );
}
