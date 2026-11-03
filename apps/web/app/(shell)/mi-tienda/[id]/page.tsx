import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getStoreFeeAccruals,
  getSubscription,
  SUBSCRIPTION_STATUS_LABEL,
} from '../../../../lib/billing';
import {
  getCategories,
  getResolvedAttributes,
  getStoreAttributes,
  getStoreCollections,
} from '../../../../lib/catalog';
import { getMe } from '../../../../lib/me';
import { getStoreOrders } from '../../../../lib/orders';
import {
  getPaymentMethods,
  getStore,
  getStoreHours,
  getStoreItems,
  getStoreKyc,
  getStoreMembers,
} from '../../../../lib/stores';
import { StoreAttributes } from '../../../_components/store-attributes';
import { StoreCatalog } from '../../../_components/store-catalog';
import { StoreCollections } from '../../../_components/store-collections';
import { StoreHours } from '../../../_components/store-hours';
import { StoreKyc } from '../../../_components/store-kyc';
import { StoreOrders } from '../../../_components/store-orders';
import { StorePayments } from '../../../_components/store-payments';
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

  // El rol del usuario en ESTA tienda define si ve los controles de gestión.
  // La API gatea igual; esto solo decide qué mostramos.
  const myRole = me.stores.find((s) => s.id === id)?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';
  // El catálogo lo gestionan también los miembros con rol `catalog`.
  const canManageCatalog = canManage || myRole === 'catalog';

  const [
    members,
    paymentMethods,
    hours,
    items,
    categories,
    ownAttrs,
    resolvedAttrs,
    collections,
    kyc,
    orders,
  ] = await Promise.all([
    getStoreMembers(id),
    getPaymentMethods(id),
    getStoreHours(id),
    getStoreItems(id),
    getCategories(),
    canManageCatalog ? getStoreAttributes(id) : Promise.resolve([]),
    canManageCatalog ? getResolvedAttributes(id) : Promise.resolve([]),
    getStoreCollections(id),
    canManage ? getStoreKyc(id) : Promise.resolve([]),
    getStoreOrders(id),
  ]);
  const subscription = await getSubscription(id);
  const fees = canManage ? await getStoreFeeAccruals(id) : null;

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
        {subscription && (
          <p className="text-sm">
            <span className="text-muted-foreground">Suscripción: </span>
            <span className="text-foreground">
              {subscription.planName} · {subscription.currency}{' '}
              {subscription.priceAmount}/mes
            </span>
            <span className="ml-2 rounded-md bg-seller/20 px-1.5 py-0.5 align-middle text-foreground text-xs">
              {SUBSCRIPTION_STATUS_LABEL[subscription.status]}
            </span>
            {subscription.periodEnd && (
              <span className="ml-2 text-muted-foreground text-xs">
                hasta{' '}
                {new Date(subscription.periodEnd).toLocaleDateString('es', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            )}
          </p>
        )}
        {fees && Number(fees.total) > 0 && (
          <p className="text-muted-foreground text-sm">
            Comisiones devengadas: {fees.currency} {fees.total}
          </p>
        )}
      </div>

      <StoreOrders orders={orders} />

      <StoreKyc
        storeId={store.id}
        verificationLevel={store.verificationLevel}
        submissions={kyc}
        canManage={canManage}
      />

      <StoreTeam
        storeId={store.id}
        ownerId={store.ownerId}
        members={members}
        canManage={canManage}
      />

      <StoreCatalog
        storeId={store.id}
        items={items}
        categories={categories}
        canManage={canManageCatalog}
      />

      {canManageCatalog && (
        <StoreAttributes
          storeId={store.id}
          own={ownAttrs}
          resolved={resolvedAttrs}
        />
      )}

      <StoreCollections
        storeId={store.id}
        collections={collections}
        items={items}
        canManage={canManageCatalog}
      />

      <StoreHours storeId={store.id} hours={hours} canManage={canManage} />

      <StorePayments
        storeId={store.id}
        methods={paymentMethods}
        canManage={canManage}
      />
    </div>
  );
}
