import { loadEnv } from '@3b/config';
import { and, createDb, eq, schema } from '@3b/db';
import { auth } from './index';

// Crea cuentas `credential` (email+password) para los usuarios del seed, con un
// password de DESARROLLO. Idempotente. Correr DESPUÉS de `pnpm db:seed`.
const DEV_PASSWORD = 'Password123!';
const EMAILS = [
  'admin@3b.test',
  'ana@3b.test',
  'carlos@3b.test',
  'marta@3b.test',
  'pedro@3b.test',
  'lucia@3b.test',
];

async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(DEV_PASSWORD);

  let n = 0;
  for (const email of EMAILS) {
    const [u] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (!u) continue;
    await db
      .delete(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, u.id),
          eq(schema.accounts.providerId, 'credential'),
        ),
      );
    await db.insert(schema.accounts).values({
      userId: u.id,
      accountId: u.id,
      providerId: 'credential',
      password: hash,
    });
    n++;
  }
  console.log(
    `[auth seed] ${n} cuentas credential creadas (password de dev: ${DEV_PASSWORD})`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[auth seed] error:', err);
  process.exit(1);
});
