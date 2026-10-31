import {
  boolean,
  index,
  pgSchema,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
import { communities } from './community';
import { users } from './identity';

// Esquema `store`: la capacidad de Seller se obtiene vía membresías de tienda.
export const store = pgSchema('store');

export const stores = store.table(
  'stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'restrict' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(), // products | services
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    unique('stores_community_slug_unique').on(t.communityId, t.slug),
    index('stores_community_idx').on(t.communityId),
    index('stores_owner_idx').on(t.ownerId),
  ],
);

/** Miembro de una tienda con rol de alcance de tienda (Seller). */
export const storeMembers = store.table(
  'store_members',
  {
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('sales'), // owner | admin | catalog | sales
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.userId] }),
    index('store_members_user_idx').on(t.userId),
  ],
);

/**
 * Método de cobro de una tienda. `details` guarda el JSON de los campos del
 * método **cifrado en reposo** (base64 de `pgp_sym_encrypt`, pgcrypto); el repo
 * lo cifra/descifra con la passphrase de entorno. Nunca se escribe en claro.
 */
export const paymentMethods = store.table(
  'payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // pago_movil | transferencia | zelle | binance | efectivo | otro
    details: text('details').notNull(), // base64(pgp_sym_encrypt(json))
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('payment_methods_store_idx').on(t.storeId)],
);
