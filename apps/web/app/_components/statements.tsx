import type { Statement } from '@3b/contracts';
import { formatPeriod, STATEMENT_STATUS_LABEL } from '../../lib/billing';

/** Clases del badge de estado (cobrado = verde/mover; reportado = ámbar/seller). */
const STATUS_BADGE: Record<Statement['status'], string> = {
  open: 'bg-muted text-muted-foreground',
  pending: 'bg-seller/20 text-foreground',
  paid: 'bg-mover/20 text-foreground',
};

/**
 * Estados de cuenta mensuales de un sujeto (tienda o Mover). Presentacional, solo
 * lectura (M7c.1): período, desglose (suscripción + comisiones), total y estado. El
 * cobro por comprobante llega en M7c.2.
 */
export function Statements({ statements }: { statements: Statement[] }) {
  if (statements.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="font-medium text-foreground">Estados de cuenta</h2>
      <ul className="space-y-2">
        {statements.map((s) => (
          <li
            key={s.id}
            className="glass flex flex-wrap items-center justify-between gap-2 rounded-lg p-3"
          >
            <div className="space-y-0.5">
              <p className="font-medium text-foreground text-sm capitalize">
                {formatPeriod(s.period)}
              </p>
              <p className="text-muted-foreground text-xs">
                {Number(s.subscriptionAmount) > 0 && (
                  <>
                    Suscripción {s.currency} {s.subscriptionAmount} ·{' '}
                  </>
                )}
                Comisiones {s.currency} {s.commissionAmount}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-sm">
                {s.currency} {s.total}
              </span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs ${STATUS_BADGE[s.status]}`}
              >
                {STATEMENT_STATUS_LABEL[s.status]}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
