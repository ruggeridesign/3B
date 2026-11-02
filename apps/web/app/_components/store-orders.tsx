import type { Order } from '@3b/contracts';
import Link from 'next/link';
import { ORDER_STATUS_LABEL } from '../../lib/orders';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Pedidos recibidos por la tienda (M5b). Lista los recientes con su estado y
 * enlaza a la ficha, donde el Seller los mueve por la máquina de estados
 * (aceptar / rechazar / marcar listo). Solo se muestra a miembros de la tienda.
 */
export function StoreOrders({ orders }: { orders: Order[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-medium text-foreground">Pedidos recibidos</h2>
      {orders.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no recibiste pedidos.
        </p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/comprar/pedidos/${o.id}`}
                className="glass flex items-center justify-between gap-3 rounded-lg p-3 transition-colors hover:bg-accent/10"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground text-sm">
                    Pedido #{o.number}
                    <span className="ml-2 rounded-md bg-seller/20 px-1.5 py-0.5 align-middle text-foreground text-xs">
                      {ORDER_STATUS_LABEL[o.status]}
                    </span>
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {o.items.length} línea(s) · {fmtDate(o.createdAt)}
                  </p>
                </div>
                <p className="shrink-0 text-foreground text-sm">
                  {o.currency} {o.total}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
