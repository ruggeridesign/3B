import type { Statement } from '@3b/contracts';
import { formatPeriod, STATEMENT_STATUS_LABEL } from '../../lib/billing';
import { StatementReport } from './statement-report';

/** Clases del badge de estado (cobrado = verde/mover; reportado = ámbar/seller). */
const STATUS_BADGE: Record<Statement['status'], string> = {
  open: 'bg-muted text-muted-foreground',
  pending: 'bg-seller/20 text-foreground',
  paid: 'bg-mover/20 text-foreground',
};

/**
 * Estados de cuenta mensuales de un sujeto (tienda o Mover): período, desglose
 * (suscripción + comisiones), total y estado (M7c.1). Si `canReport` (el que mira es el
 * sujeto), ofrece reportar el pago de los estados `open` por comprobante (M7c.2) → pasan
 * a `pending` hasta que el admin confirme el cobro.
 */
export function Statements({
  statements,
  canReport = false,
}: {
  statements: Statement[];
  canReport?: boolean;
}) {
  if (statements.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="font-medium text-foreground">Estados de cuenta</h2>
      <ul className="space-y-2">
        {statements.map((s) => (
          <li key={s.id} className="glass rounded-lg p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
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
            </div>
            {canReport && s.status === 'open' && (
              <StatementReport
                statementId={s.id}
                defaultAmount={s.total}
                currency={s.currency}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
