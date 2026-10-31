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
  createGlobalAttribute,
  createStoreAttribute,
  resolveAttributes,
} from '../../src/modules/catalog';

// UUIDs del seed determinista.
const ADMIN = '22222222-2222-2222-2222-222222222201'; // admin de plataforma
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de Ferretería
const MARTA = '22222222-2222-2222-2222-222222222204'; // sales (no gestiona catálogo)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // no es miembro de la tienda
const FERRETERIA = '33333333-3333-3333-3333-333333333301';
const CAT_TALADROS = '55555555-5555-5555-5555-555555555502'; // hija de Herramientas

const KEY_STORE = 'test_material';
const KEY_GLOBAL = 'test_global_attr';

const env = loadEnv();
const { db, client } = createAppDb(env.APP_DATABASE_URL);

function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

afterAll(async () => {
  await asUser(CARLOS, (tx) =>
    tx
      .delete(schema.attributeDefinitions)
      .where(eq(schema.attributeDefinitions.key, KEY_STORE)),
  );
  await asUser(ADMIN, (tx) =>
    tx
      .delete(schema.attributeDefinitions)
      .where(eq(schema.attributeDefinitions.key, KEY_GLOBAL)),
  );
  await client.end();
});

describe('catalog: atributos (alcances + herencia) bajo RLS', () => {
  it('la resolución hereda global + categoría (ancestros) + tienda', async () => {
    // Del seed: global (marca, color), categoría Taladros (voltaje), tienda
    // Ferretería (garantia_meses). Taladros cuelga de Herramientas.
    const resolved = await asUser(CARLOS, (tx) =>
      resolveAttributes(tx, FERRETERIA, CAT_TALADROS),
    );
    const keys = resolved.map((a) => a.key);
    expect(keys).toEqual(
      expect.arrayContaining(['marca', 'color', 'voltaje', 'garantia_meses']),
    );

    // Sin categoría: NO aparece el atributo de categoría (voltaje).
    const noCat = await asUser(CARLOS, (tx) =>
      resolveAttributes(tx, FERRETERIA, null),
    );
    const noCatKeys = noCat.map((a) => a.key);
    expect(noCatKeys).toContain('marca'); // global
    expect(noCatKeys).toContain('garantia_meses'); // tienda
    expect(noCatKeys).not.toContain('voltaje'); // categoría (sin categoría)
  });

  it('owner/catalog crea un atributo de tienda; sales NO (RLS)', async () => {
    const attr = await asUser(CARLOS, (tx) =>
      createStoreAttribute(tx, FERRETERIA, {
        key: KEY_STORE,
        label: 'Material',
        dataType: 'text',
      }),
    );
    expect(attr).toMatchObject({
      scope: 'store',
      scopeId: FERRETERIA,
      key: KEY_STORE,
    });

    await expect(
      asUser(MARTA, (tx) =>
        createStoreAttribute(tx, FERRETERIA, {
          key: 'test_no',
          label: 'No',
          dataType: 'text',
        }),
      ),
    ).rejects.toThrow();
  });

  it('solo el admin de plataforma crea atributos globales', async () => {
    const attr = await asUser(ADMIN, (tx) =>
      createGlobalAttribute(tx, {
        scope: 'global',
        key: KEY_GLOBAL,
        label: 'Global de test',
        dataType: 'text',
      }),
    );
    expect(attr).toMatchObject({
      scope: 'global',
      scopeId: null,
      key: KEY_GLOBAL,
    });

    await expect(
      asUser(CARLOS, (tx) =>
        createGlobalAttribute(tx, {
          scope: 'global',
          key: 'test_global_prohibido',
          label: 'Prohibido',
          dataType: 'text',
        }),
      ),
    ).rejects.toThrow();
  });

  it('un no-miembro no ve los atributos de tienda en la resolución (RLS)', async () => {
    const resolved = await asUser(LUCIA, (tx) =>
      resolveAttributes(tx, FERRETERIA, CAT_TALADROS),
    );
    const keys = resolved.map((a) => a.key);
    // Ve los globales/categoría (públicos) pero NO los de la tienda ajena.
    expect(keys).toContain('marca');
    expect(keys).not.toContain('garantia_meses');
  });
});
