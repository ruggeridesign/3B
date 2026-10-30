import type { HealthResponse } from '@3b/contracts';

export interface ApiClientOptions {
  baseUrl: string;
  /** Permite inyectar un fetch (SSR, tests). Por defecto usa el global. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Cliente tipado de la API de 3B. La web lo usa para no hablar nunca
 * directamente con la base ni con la lógica de negocio.
 */
export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl.replace(/\/$/, '');

  return {
    async getHealth(): Promise<HealthResponse> {
      const res = await doFetch(`${base}/v1/health`);
      if (!res.ok) {
        throw new Error(`La API respondió ${res.status}`);
      }
      return (await res.json()) as HealthResponse;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
