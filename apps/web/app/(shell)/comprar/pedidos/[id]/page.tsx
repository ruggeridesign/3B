import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '../../../../../lib/me';
import { getOrderThread } from '../../../../../lib/messaging';
import {
  getMediaUrl,
  getOrder,
  getOrderPayments,
  ORDER_STATUS_LABEL,
  type OrderAction,
  orderActions,
} from '../../../../../lib/orders';
import { getOrderShipment } from '../../../../../lib/shipping';
import { getOrderReviews } from '../../../../../lib/social';
import { OrderActions } from '../../../../_components/order-actions';
import { OrderChat } from '../../../../_components/order-chat';
import { PaymentPanel } from '../../../../_components/payment-panel';
import { ReviewForm } from '../../../../_components/review-form';
import { ShipmentPanel } from '../../../../_components/shipment-panel';

const FULFILLMENT_LABEL: Record<string, string> = {
  pickup: 'Retiro en tienda',
  delivery: 'Envío a domicilio',
  service: 'Servicio',
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function PedidoDetalle({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getMe();
  if (!me) redirect('/login');

  const { id } = await params;
  const o = await getOrder(id);
  if (!o) {
    return (
      <div className="space-y-4">
        <Link href="/comprar/pedidos" className="text-muted-foreground text-sm">
          ← Mis pedidos
        </Link>
        <p className="text-muted-foreground text-sm">
          No encontramos ese pedido.
        </p>
      </div>
    );
  }

  const payments = await getOrderPayments(id);
  const thread = await getOrderThread(id);
  const reviews = await getOrderReviews(id);
  const shipment = await getOrderShipment(id);

  // URLs de las capturas de pago (visibles para ambas partes por la policy
  // media→pedido, M5c.2). Se resuelven acá para no exponer el id crudo.
  const proofUrls: Record<string, string> = {};
  for (const [mid, url] of await Promise.all(
    payments
      .filter((p) => p.proofMediaId)
      .map(
        async (p) =>
          [
            p.proofMediaId as string,
            await getMediaUrl(p.proofMediaId as string),
          ] as const,
      ),
  )) {
    if (url) proofUrls[mid] = url;
  }

  // Rol del viewer frente a ESTE pedido: miembro de la tienda (Seller) y/o dueño
  // (Maker). Según eso se ofrecen las transiciones válidas (la API gatea igual).
  const isSeller = me.stores.some((s) => s.id === o.storeId);
  const isMaker = o.makerId === me.user.id;
  const actionMap = new Map<string, OrderAction>();
  if (isSeller) {
    for (const a of orderActions(o.status, 'seller'))
      actionMap.set(a.toStatus, a);
  }
  if (isMaker) {
    for (const a of orderActions(o.status, 'maker'))
      actionMap.set(a.toStatus, a);
  }
  const actions = [...actionMap.values()];

  // Reseña de la tienda: visible al comprador; puede dejarla al `completado` si
  // aún no lo hizo. El `subjectType` 'store' es el único que se cablea en M5d.2.
  const myReview =
    reviews.find(
      (r) => r.authorId === me.user.id && r.subjectType === 'store',
    ) ?? null;
  const canReview = isMaker && o.status === 'completado' && !myReview;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/comprar/pedidos" className="text-muted-foreground text-sm">
          ← Mis pedidos
        </Link>
        <h1 className="font-bold text-2xl text-foreground">
          Pedido #{o.number}
          <span className="ml-2 rounded-md bg-seller/20 px-1.5 py-0.5 align-middle text-foreground text-xs">
            {ORDER_STATUS_LABEL[o.status]}
          </span>
        </h1>
        <p className="text-muted-foreground text-sm">
          {o.storeName ?? 'Tienda'} · {FULFILLMENT_LABEL[o.fulfillment]} ·{' '}
          {fmtDateTime(o.createdAt)}
        </p>
      </div>

      {actions.length > 0 && <OrderActions orderId={o.id} actions={actions} />}

      <PaymentPanel
        orderId={o.id}
        status={o.status}
        isMaker={isMaker}
        isSeller={isSeller}
        meId={me.user.id}
        payments={payments}
        proofUrls={proofUrls}
        defaultAmount={o.total}
        defaultCurrency={o.currency}
      />

      {o.fxRateVes && (
        <p className="text-muted-foreground text-sm">
          Tasa congelada: 1 {o.currency} = {o.fxRateVes} Bs · ≈{' '}
          {(Number(o.total) * Number(o.fxRateVes)).toLocaleString('es-VE', {
            maximumFractionDigits: 2,
          })}{' '}
          Bs
        </p>
      )}

      {thread && (
        <OrderChat
          orderId={o.id}
          messages={thread.messages}
          meId={me.user.id}
        />
      )}

      <ShipmentPanel
        orderId={o.id}
        fulfillment={o.fulfillment}
        orderStatus={o.status}
        shipment={shipment}
        isSeller={isSeller}
      />

      <ReviewForm orderId={o.id} review={myReview} canReview={canReview} />

      <section className="space-y-2">
        <h2 className="font-medium text-foreground">Líneas</h2>
        <ul className="space-y-2">
          {o.items.map((l) => (
            <li
              key={l.id}
              className="glass flex items-center justify-between gap-3 rounded-lg p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground text-sm">
                  {l.title}
                </p>
                <p className="text-muted-foreground text-xs">
                  {l.sku ?? ''} · {l.currency} {l.unitPrice} × {l.qty}
                </p>
              </div>
              <p className="shrink-0 text-foreground text-sm">
                {l.currency} {l.lineTotal}
              </p>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="text-foreground">
              {o.currency} {o.subtotal}
            </dd>
          </div>
          <div className="flex justify-between font-medium">
            <dt className="text-foreground">Total</dt>
            <dd className="text-foreground">
              {o.currency} {o.total}
            </dd>
          </div>
        </dl>
      </section>

      {o.addressSnapshot && (
        <section className="space-y-1">
          <h2 className="font-medium text-foreground">Entrega</h2>
          <p className="text-muted-foreground text-sm">
            {o.addressSnapshot.line1}
            {o.addressSnapshot.phone ? ` · ${o.addressSnapshot.phone}` : ''}
          </p>
          {o.addressSnapshot.notes && (
            <p className="text-muted-foreground text-sm">
              {o.addressSnapshot.notes}
            </p>
          )}
        </section>
      )}

      {o.events && o.events.length > 0 && (
        <section className="space-y-1">
          <h2 className="font-medium text-foreground">Historial</h2>
          <ul className="space-y-1 text-muted-foreground text-sm">
            {o.events.map((e) => (
              <li key={e.id}>
                {fmtDateTime(e.createdAt)} —{' '}
                {ORDER_STATUS_LABEL[e.toStatus] ?? e.toStatus}
                {e.reason ? ` · ${e.reason}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
