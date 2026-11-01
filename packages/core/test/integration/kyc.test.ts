import { loadEnv } from '@3b/config';
import {
  type AppTransaction,
  createAppDb,
  eq,
  schema,
  withAppContext,
} from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createSubmission,
  listPendingByCommunity,
  listSubmissionsBySubject,
  reviewSubmission,
} from '../../src/modules/identity/infra/kyc-repo';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const ANA = '22222222-2222-2222-2222-222222222202'; // admin de comunidad (Coro)
const MARTA = '22222222-2222-2222-2222-222222222204'; // sales (no revisa)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // miembro de Coro, no del equipo
const CORO = '11111111-1111-1111-1111-111111111101';
const FERRETERIA = '33333333-3333-3333-3333-333333333301';

// doc_type marcador para distinguir la fila del test del seed.
const DOC = 'pasaporte';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await asUser(CARLOS, (tx) =>
    tx
      .delete(schema.kycSubmissions)
      .where(eq(schema.kycSubmissions.docType, DOC)),
  );
  await client.end();
});

describe('identity: verificación KYC bajo RLS', () => {
  it('owner envía; el admin de comunidad la ve en la cola y la aprueba (trigger)', async () => {
    const created = await asUser(CARLOS, (tx) =>
      createSubmission(tx, {
        subjectType: 'store',
        subjectId: FERRETERIA,
        docType: DOC,
      }),
    );
    expect(created).toMatchObject({
      subjectId: FERRETERIA,
      status: 'pending',
      reviewerId: null,
    });

    // El owner ve el historial de su tienda.
    const mine = await asUser(CARLOS, (tx) =>
      listSubmissionsBySubject(tx, 'store', FERRETERIA),
    );
    expect(mine.some((s) => s.id === created.id)).toBe(true);

    // Ana (admin de Coro) la ve en la cola pendiente de la comunidad.
    const queue = await asUser(ANA, (tx) => listPendingByCommunity(tx, CORO));
    expect(queue.some((s) => s.id === created.id)).toBe(true);

    // Ana aprueba → el trigger deja la tienda `verified`.
    const reviewed = await asUser(ANA, (tx) =>
      reviewSubmission(tx, created.id, ANA, 'approve', 'OK'),
    );
    expect(reviewed).toMatchObject({ status: 'approved', reviewerId: ANA });

    const [store] = await asUser(CARLOS, (tx) =>
      tx
        .select({ level: schema.stores.verificationLevel })
        .from(schema.stores)
        .where(eq(schema.stores.id, FERRETERIA)),
    );
    expect(store.level).toBe('verified');
  });

  it('un vendedor (sales) no puede revisar; un no-miembro no la ve', async () => {
    const sub = await asUser(CARLOS, (tx) =>
      createSubmission(tx, {
        subjectType: 'store',
        subjectId: FERRETERIA,
        docType: DOC,
      }),
    );

    // Marta (sales) no es admin de comunidad → la RLS no deja el update
    // (reviewSubmission devuelve null: 0 filas afectadas).
    const byMarta = await asUser(MARTA, (tx) =>
      reviewSubmission(tx, sub.id, MARTA, 'approve', null),
    );
    expect(byMarta).toBeNull();

    // Lucía (miembro de Coro, no del equipo ni admin) no ve la verificación.
    const hers = await asUser(LUCIA, (tx) =>
      listSubmissionsBySubject(tx, 'store', FERRETERIA),
    );
    expect(hers).toHaveLength(0);
  });
});
