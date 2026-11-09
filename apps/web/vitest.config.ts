import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Tests de componentes (RTL + jsdom). No tocan la red ni la DB: mockean
// `fetch`/`next`. `@3b/ui` se consume desde la FUENTE (TSX), por eso se "inline"
// para que vitest lo transforme.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    server: { deps: { inline: ['@3b/ui'] } },
  },
});
