import { loadEnv } from '@3b/config';
import {
  type AppTransaction,
  createAppDb,
  eq,
  schema,
  withAppContext,
} from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createItem } from '../../src/modules/catalog';
import {
  answerQuestion,
  askQuestion,
  listItemQuestions,
} from '../../src/modules/social';

// UUIDs del seed determinista.
const CARLOS = '22222222-2222-2222-2222-222222222203'; // miembro de Ferretería (Coro)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker (Coro), no es de la tienda
const FERRETERIA = '33333333-3333-3333-3333-333333333301';
const TALADRO = '44444444-4444-4444-4444-444444444401'; // ítem publicado del seed

const DRAFT_SLUG = 'test-questions-draft';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await asUser(CARLOS, (tx) =>
    tx.delete(schema.items).where(eq(schema.items.slug, DRAFT_SLUG)),
  );
  await client.end();
});

describe('questions (M5d.3): preguntas públicas de un ítem bajo RLS', () => {
  it('un miembro de la comunidad pregunta y la tienda la ve', async () => {
    const res = await asUser(LUCIA, (tx) =>
      askQuestion(tx, TALADRO, LUCIA, '¿Trae mandril de 13mm?'),
    );
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.question.authorId).toBe(LUCIA);
      expect(res.question.answer).toBeNull();
    }

    const seen = await asUser(CARLOS, (tx) => listItemQuestions(tx, TALADRO));
    expect(seen.some((q) => q.body === '¿Trae mandril de 13mm?')).toBe(true);
  });

  it('la tienda responde una pregunta', async () => {
    const asked = await asUser(LUCIA, (tx) =>
      askQuestion(tx, TALADRO, LUCIA, '¿Hay garantía?'),
    );
    if (asked.status !== 'ok') throw new Error('setup ask');

    const res = await asUser(CARLOS, (tx) =>
      answerQuestion(tx, asked.question.id, CARLOS, 'Sí, 6 meses.'),
    );
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.question.answer).toBe('Sí, 6 meses.');
      expect(res.question.answeredAt).not.toBeNull();
    }
  });

  it('RLS: un no-miembro de la tienda no puede responder', async () => {
    const asked = await asUser(LUCIA, (tx) =>
      askQuestion(tx, TALADRO, LUCIA, '¿Envían a Punto Fijo?'),
    );
    if (asked.status !== 'ok') throw new Error('setup ask');

    // Lucía (no es de la tienda) intenta responder: la RLS (UPDATE = miembro)
    // no afecta ninguna fila → not_found.
    const res = await asUser(LUCIA, (tx) =>
      answerQuestion(tx, asked.question.id, LUCIA, 'colado'),
    );
    expect(res.status).toBe('not_found');
  });

  it('no se puede preguntar sobre un ítem no publicado', async () => {
    const draft = await asUser(CARLOS, (tx) =>
      createItem(tx, {
        storeId: FERRETERIA,
        kind: 'product',
        slug: DRAFT_SLUG,
        title: 'Borrador (preguntas)',
        currency: 'USD',
        priceMode: 'fixed',
        status: 'draft',
      }),
    );
    // Carlos ve su borrador (miembro) pero no está publicado → item_not_available.
    const res = await asUser(CARLOS, (tx) =>
      askQuestion(tx, draft.id, CARLOS, '¿Se puede?'),
    );
    expect(res.status).toBe('item_not_available');
  });
});
