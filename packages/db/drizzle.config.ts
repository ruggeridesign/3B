import { defineConfig } from 'drizzle-kit';

// Requiere Postgres local (ver docker-compose.yml) para `generate`/`migrate`.
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://3b:3b@localhost:5433/3b',
  },
});
