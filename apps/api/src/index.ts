import { serve } from '@hono/node-server';
import { createApiApp } from './app';

// Entrypoint: construye la app (ver `app.ts`) y abre el socket + WebSockets.
const { app, injectWebSocket, port } = createApiApp();

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[3b-api] http://localhost:${info.port}  (docs: /docs)`);
});
injectWebSocket(server);
