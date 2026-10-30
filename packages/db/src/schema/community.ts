import {
  doublePrecision,
  index,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_shared';
import { users } from './identity';

// Esquema `community`: multi-tenancy (cada módulo es dueño de su esquema).
export const community = pgSchema('community');

export const communities = community.table('communities', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull().default('town'), // town | gated | district
  visibility: text('visibility').notNull().default('public'), // public | private
  settings: jsonb('settings').notNull().default({}),
  ...timestamps,
});

/** Vecindad precalculada entre comunidades (para búsqueda de cercanas). */
export const communityLinks = community.table(
  'community_links',
  {
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    neighborId: uuid('neighbor_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    distanceKm: doublePrecision('distance_km').notNull(),
    weight: doublePrecision('weight').notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.neighborId] })],
);

/** Membresía de un usuario en una comunidad (rol con alcance de comunidad). */
export const memberships = community.table(
  'memberships',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'), // member | moderator | admin
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.communityId] }),
    index('memberships_community_idx').on(t.communityId),
  ],
);
