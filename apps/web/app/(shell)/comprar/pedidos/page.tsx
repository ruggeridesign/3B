import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '../../../../lib/me';
import { getMyOrders, ORDER_STATUS_LABEL } from '../../../../lib/orders';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function MisPedidos() {
  const me = await getMe();
  if (!me) redirect('/login');

  const orders = await getMyOrders();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/comprar" className="text-muted-foreground text-sm">
          ← Comprar
        </Link>
        <h1 className="font-bold text-2xl text-foreground">Mis pedidos</h1>
      </div>

      {orders.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no hiciste pedidos.
        </p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/comprar/pedidos/${o.id}`}
                className="glass flex items-center justify-between gap-3 rounded-lg p-4 transition-colors hover:border-ring"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    Pedido #{o.number}
                    <span className="ml-2 rounded-md bg-seller/20 px-1.5 py-0.5 text-foreground text-xs">
                      {ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {o.storeName ?? 'Tienda'} · {fmtDate(o.createdAt)}
                  </p>
                </div>
                <p className="shrink-0 font-medium text-foreground">
                  {o.currency} {o.total}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
