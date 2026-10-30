import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// El design system se construye en modo librería: `vite build` genera `dist/`
// listo para consumir desde la app de 3B. `vite dev` sirve el playground.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    dts({ include: ['src'], tsconfigPath: './tsconfig.json' }),
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      // React lo aporta la app consumidora, no lo empaquetamos.
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    sourcemap: true,
  },
});
