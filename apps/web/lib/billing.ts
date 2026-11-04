import type {
  FeeAccrualList,
  PaymentReportList,
  Statement,
  StatementList,
  Subscription,
} from '@3b/contracts';
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

async function cookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

/** Etiqueta legible del estado de una suscripción. */
export const SUBSCRIPTION_STATUS_LABEL: Record<Subscription['status'], string> =
  {
    trial: 'Prueba',
    active: 'Activa',
    past_due: 'Vencida',
    cancelled: 'Cancelada',
  };

/** Etiqueta legible del estado de un estado de cuenta. */
export const STATEMENT_STATUS_LABEL: Record<Statement['status'], string> = {
  open: 'Por cobrar',
  pending: 'Pago reportado',
  paid: 'Cobrado',
};

/** Convierte `YYYY-MM` en un rótulo legible (ej. "octubre 2026"). */
export function formatPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Comisiones devengadas de una tienda (equipo o admin). null si falla. */
export async function getStoreFeeAccruals(
  storeId: string,
): Promise<FeeAccrualList | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/stores/${storeId}/fee-accruals`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as FeeAccrualList;
  } catch {
    return null;
  }
}

/** Mis comisiones devengadas como Mover. null si falla. */
export async function getMyFeeAccruals(): Promise<FeeAccrualList | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/me/fee-accruals`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as FeeAccrualList;
  } catch {
    return null;
  }
}

/** Suscripción de una tienda. null si no es visible o falla. */
export async function getSubscription(
  storeId: string,
): Promise<Subscription | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/stores/${storeId}/subscription`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as Subscription;
  } catch {
    return null;
  }
}

/** Estados de cuenta de una tienda (equipo o admin). null si falla. */
export async function getStoreStatements(
  storeId: string,
): Promise<StatementList | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/stores/${storeId}/statements`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as StatementList;
  } catch {
    return null;
  }
}

/** Mis estados de cuenta como Mover. null si falla. */
export async function getMyStatements(): Promise<StatementList | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/me/statements`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as StatementList;
  } catch {
    return null;
  }
}

/** Cobros por confirmar (estados de cuenta `pending`) visibles para mí (admin). */
export async function getPendingCollections(): Promise<StatementList | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/me/collections`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as StatementList;
  } catch {
    return null;
  }
}

/** Reportes de pago de un estado de cuenta. null si falla. */
export async function getStatementPayments(
  statementId: string,
): Promise<PaymentReportList | null> {
  const cookie = await cookieHeader();
  if (!cookie) return null;
  try {
    const res = await fetch(`${API}/v1/statements/${statementId}/payments`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PaymentReportList;
  } catch {
    return null;
  }
}
