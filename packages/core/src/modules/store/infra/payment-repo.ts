import type {
  CreatePaymentMethodInput,
  PaymentMethod,
  UpdatePaymentMethodInput,
} from '@3b/contracts';
import { type AppTransaction, sql } from '@3b/db';

/**
 * Repo de métodos de pago. Los `details` se guardan **cifrados en reposo** con
 * pgcrypto (`pgp_sym_encrypt`), en base64, usando una passphrase que llega por
 * parámetro desde la capa de la app (nunca se importa env en core). Las lecturas
 * descifran para el dueño (la RLS ya acota a miembros de la tienda).
 */

type PmRow = {
  id: string;
  store_id: string;
  type: string;
  active: boolean;
  created_at: string | Date;
};

function rowToPm(row: PmRow, details: PaymentMethod['details']): PaymentMethod {
  return {
    id: row.id,
    storeId: row.store_id,
    type: row.type as PaymentMethod['type'],
    details,
    active: row.active,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** Métodos de pago de una tienda (detalles descifrados). */
export async function listPaymentMethods(
  db: AppTransaction,
  encKey: string,
  storeId: string,
): Promise<PaymentMethod[]> {
  const rows = (await db.execute(sql`
    SELECT id, store_id, type, active, created_at,
           pgp_sym_decrypt(decode(details, 'base64'), ${encKey}) AS details
    FROM store.payment_methods
    WHERE store_id = ${storeId}
    ORDER BY created_at
  `)) as unknown as Array<PmRow & { details: string }>;
  return rows.map((r) => rowToPm(r, JSON.parse(r.details)));
}

/** Un método de pago por id dentro de una tienda (o null si no existe/RLS). */
export async function getPaymentMethod(
  db: AppTransaction,
  encKey: string,
  storeId: string,
  id: string,
): Promise<PaymentMethod | null> {
  const rows = (await db.execute(sql`
    SELECT id, store_id, type, active, created_at,
           pgp_sym_decrypt(decode(details, 'base64'), ${encKey}) AS details
    FROM store.payment_methods
    WHERE store_id = ${storeId} AND id = ${id}
    LIMIT 1
  `)) as unknown as Array<PmRow & { details: string }>;
  const row = rows[0];
  return row ? rowToPm(row, JSON.parse(row.details)) : null;
}

/** Crea un método de pago cifrando los detalles. La RLS exige owner/admin. */
export async function createPaymentMethod(
  db: AppTransaction,
  encKey: string,
  input: { storeId: string } & CreatePaymentMethodInput,
): Promise<PaymentMethod> {
  const detailsJson = JSON.stringify(input.details);
  const active = input.active ?? true;
  const rows = (await db.execute(sql`
    INSERT INTO store.payment_methods (store_id, type, details, active)
    VALUES (
      ${input.storeId},
      ${input.type},
      encode(pgp_sym_encrypt(${detailsJson}, ${encKey}), 'base64'),
      ${active}
    )
    RETURNING id, store_id, type, active, created_at
  `)) as unknown as PmRow[];
  // Los detalles son los del input; no hace falta descifrar de vuelta.
  return rowToPm(rows[0], input.details);
}

/**
 * Edita parcialmente un método de pago (detalles y/o activo). Lee el actual,
 * aplica el patch y re-cifra. Devuelve null si no existe (o la RLS lo oculta).
 */
export async function updatePaymentMethod(
  db: AppTransaction,
  encKey: string,
  input: { storeId: string; id: string } & UpdatePaymentMethodInput,
): Promise<PaymentMethod | null> {
  const current = await getPaymentMethod(db, encKey, input.storeId, input.id);
  if (!current) return null;

  const details = input.details ?? current.details;
  const active = input.active ?? current.active;
  const detailsJson = JSON.stringify(details);
  const rows = (await db.execute(sql`
    UPDATE store.payment_methods
    SET details = encode(pgp_sym_encrypt(${detailsJson}, ${encKey}), 'base64'),
        active = ${active},
        updated_at = now()
    WHERE store_id = ${input.storeId} AND id = ${input.id}
    RETURNING id, store_id, type, active, created_at
  `)) as unknown as PmRow[];
  const row = rows[0];
  return row ? rowToPm(row, details) : null;
}

/** Borra un método de pago. Devuelve si existía (y la RLS dejó borrarlo). */
export async function deletePaymentMethod(
  db: AppTransaction,
  storeId: string,
  id: string,
): Promise<boolean> {
  const rows = (await db.execute(sql`
    DELETE FROM store.payment_methods
    WHERE store_id = ${storeId} AND id = ${id}
    RETURNING id
  `)) as unknown as Array<{ id: string }>;
  return rows.length > 0;
}
