import { loadEnv } from '@3b/config';
import { type AppTransaction, createAppDb, withAppContext } from '@3b/db';
import { afterAll, describe, expect, it } from 'vitest';
import {
  canManageStore,
  isCommunityAdmin,
  isCommunityMember,
  isMoverApproved,
  isPlatformAdmin,
  isStoreMember,
} from '../../src/http';

// UUIDs del seed determinista.
const ADMIN = '22222222-2222-2222-2222-222222222201'; // admin de plataforma
const ANA = '22222222-2222-2222-2222-222222222202'; // admin de comunidad (Coro)
const CARLOS = '22222222-2222-2222-2222-222222222203'; // owner de tiendas
const MARTA = '22222222-2222-2222-2222-222222222204'; // sales en Ferretería
const PEDRO = '22222222-2222-2222-2222-222222222205'; // Mover aprobado (Punto Fijo)
const LUCIA = '22222222-2222-2222-2222-222222222206'; // Maker a secas (Coro)

const CORO = '11111111-1111-1111-1111-111111111101';
const PUNTO_FIJO = '11111111-1111-1111-1111-111111111102';
const FERRETERIA = '33333333-3333-3333-3333-333333333301';

const env = loadEnv();
// Rol `app` (mínimo privilegio): los predicados corren bajo RLS, igual que en
// producción. Las funciones authz.* son SECURITY DEFINER y derivan de la base.
const { db, client } = createAppDb(env.APP_DATABASE_URL);

afterAll(async () => {
  await client.end();
});

/** Evalúa un predicado bajo el contexto RLS del usuario `userId`. */
function asUser<T>(userId: string, fn: (tx: AppTransaction) => Promise<T>) {
  return withAppContext(db, { userId }, fn);
}

describe('Predicados de autorización (authz.*) sobre el seed', () => {
  it('isPlatformAdmin: solo el admin de plataforma', async () => {
    expect(await asUser(ADMIN, (tx) => isPlatformAdmin(tx))).toBe(true);
    expect(await asUser(LUCIA, (tx) => isPlatformAdmin(tx))).toBe(false);
  });

  it('canManageStore: owner sí; staff de ventas y ajenos no', async () => {
    expect(await asUser(CARLOS, (tx) => canManageStore(tx, FERRETERIA))).toBe(
      true,
    );
    expect(await asUser(MARTA, (tx) => canManageStore(tx, FERRETERIA))).toBe(
      false,
    );
    expect(await asUser(LUCIA, (tx) => canManageStore(tx, FERRETERIA))).toBe(
      false,
    );
  });

  it('isStoreMember: cualquier rol vs rol específico', async () => {
    expect(await asUser(MARTA, (tx) => isStoreMember(tx, FERRETERIA))).toBe(
      true,
    );
    expect(
      await asUser(MARTA, (tx) => isStoreMember(tx, FERRETERIA, ['sales'])),
    ).toBe(true);
    expect(
      await asUser(MARTA, (tx) =>
        isStoreMember(tx, FERRETERIA, ['owner', 'admin']),
      ),
    ).toBe(false);
    expect(await asUser(LUCIA, (tx) => isStoreMember(tx, FERRETERIA))).toBe(
      false,
    );
  });

  it('isCommunityAdmin / isCommunityMember: alcance acotado a la comunidad', async () => {
    expect(await asUser(ANA, (tx) => isCommunityAdmin(tx, CORO))).toBe(true);
    expect(await asUser(LUCIA, (tx) => isCommunityAdmin(tx, CORO))).toBe(false);
    expect(await asUser(LUCIA, (tx) => isCommunityMember(tx, CORO))).toBe(true);
    // Pedro es miembro de Punto Fijo, no de Coro.
    expect(await asUser(PEDRO, (tx) => isCommunityMember(tx, CORO))).toBe(
      false,
    );
    expect(await asUser(PEDRO, (tx) => isCommunityMember(tx, PUNTO_FIJO))).toBe(
      true,
    );
  });

  it('isMoverApproved: solo el Mover con perfil aprobado', async () => {
    expect(await asUser(PEDRO, (tx) => isMoverApproved(tx))).toBe(true);
    expect(await asUser(LUCIA, (tx) => isMoverApproved(tx))).toBe(false);
  });
});
