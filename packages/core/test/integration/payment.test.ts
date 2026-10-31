import { loadEnv } from '@3b/config';
import {
  type AppTransaction,
  createAppDb,
  eq,
  schema,
  sql,
  withAppContext,
} from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createPaymentMethod,
  deletePaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
} from '../../src/modules/store';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const MARTA = '22222222-2222-2222-2222-222222222204'; // sales (miembro, no manager)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // no es miembro de Ferretería
const FERRETERIA = '33333333-3333-3333-3333-333333333301';

const env = loadEnv();
const ENC = env.PAYMENTS_ENC_KEY;
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  // Limpia los métodos de pago creados por el test (el seed no trae ninguno).
  await asUser(CARLOS, (tx) =>
    tx
      .delete(schema.paymentMethods)
      .where(eq(schema.paymentMethods.storeId, FERRETERIA)),
  );
  await client.end();
});

describe('store: métodos de pago cifrados bajo RLS', () => {
  it('Carlos crea un método y los detalles hacen round-trip al descifrar', async () => {
    const created = await asUser(CARLOS, (tx) =>
      createPaymentMethod(tx, ENC, {
        storeId: FERRETERIA,
        type: 'pago_movil',
        details: { telefono: '0414-1234567', banco: '0102', cedula: 'V-123' },
      }),
    );
    expect(created).toMatchObject({
      storeId: FERRETERIA,
      type: 'pago_movil',
      active: true,
      details: { telefono: '0414-1234567', banco: '0102', cedula: 'V-123' },
    });

    const list = await asUser(CARLOS, (tx) =>
      listPaymentMethods(tx, ENC, FERRETERIA),
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.details.telefono).toBe('0414-1234567');
  });

  it('los detalles quedan CIFRADOS en reposo (la columna no trae el teléfono)', async () => {
    const rows = (await asUser(CARLOS, (tx) =>
      tx.execute(sql`
        SELECT details FROM store.payment_methods
        WHERE store_id = ${FERRETERIA} LIMIT 1
      `),
    )) as unknown as Array<{ details: string }>;
    expect(rows[0]?.details).toBeTruthy();
    // La columna guarda base64 de pgp_sym_encrypt: no debe contener el claro.
    expect(rows[0]?.details).not.toContain('0414-1234567');
  });

  it('se puede editar (desactivar + cambiar detalles) y borrar', async () => {
    const [pm] = await asUser(CARLOS, (tx) =>
      listPaymentMethods(tx, ENC, FERRETERIA),
    );
    const updated = await asUser(CARLOS, (tx) =>
      updatePaymentMethod(tx, ENC, {
        storeId: FERRETERIA,
        id: pm.id,
        active: false,
        details: { telefono: '0424-7654321', banco: '0105' },
      }),
    );
    expect(updated).toMatchObject({
      active: false,
      details: { telefono: '0424-7654321', banco: '0105' },
    });

    const existed = await asUser(CARLOS, (tx) =>
      deletePaymentMethod(tx, FERRETERIA, pm.id),
    );
    expect(existed).toBe(true);
    const after = await asUser(CARLOS, (tx) =>
      listPaymentMethods(tx, ENC, FERRETERIA),
    );
    expect(after).toHaveLength(0);
  });

  it('Marta (sales) puede listar pero NO crear (RLS pm_insert)', async () => {
    // Un método para que haya algo que listar.
    await asUser(CARLOS, (tx) =>
      createPaymentMethod(tx, ENC, {
        storeId: FERRETERIA,
        type: 'zelle',
        details: { email: 'pagos@ferreteria.test' },
      }),
    );
    const seen = await asUser(MARTA, (tx) =>
      listPaymentMethods(tx, ENC, FERRETERIA),
    );
    expect(seen.length).toBeGreaterThan(0);

    await expect(
      asUser(MARTA, (tx) =>
        createPaymentMethod(tx, ENC, {
          storeId: FERRETERIA,
          type: 'efectivo',
          details: { nota: 'no permitido' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('Lucía (no miembro) no ve nada y no puede crear (RLS)', async () => {
    const seen = await asUser(LUCIA, (tx) =>
      listPaymentMethods(tx, ENC, FERRETERIA),
    );
    expect(seen).toHaveLength(0);

    await expect(
      asUser(LUCIA, (tx) =>
        createPaymentMethod(tx, ENC, {
          storeId: FERRETERIA,
          type: 'otro',
          details: { nombre: 'intruso' },
        }),
      ),
    ).rejects.toThrow();
  });
});
