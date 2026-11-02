import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '../../../../../lib/me';
import { getOrder, ORDER_STATUS_LABEL } from '../../../../../lib/orders';

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
