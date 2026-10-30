import { createApiClient } from '@3b/api-client';
import { Button } from '@3b/ui';

async function getApiStatus(): Promise<string> {
  const client = createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787',
  });
  try {
    const health = await client.getHealth();
    return `API ${health.service} · ${health.status} · v${health.version}`;
  } catch {
    return 'API no disponible — levantá: pnpm --filter @3b/api dev';
  }
}

export default async function Home() {
  const status = await getApiStatus();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-foreground">3B</h1>
        <p className="text-muted-foreground">
          Base del monorepo funcionando (web → api-client → api → core).
        </p>
        <p className="text-sm text-muted-foreground">{status}</p>
      </div>
      <Button>Botón del Design System</Button>
    </main>
  );
}
