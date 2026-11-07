import { SerwistProvider } from '@serwist/turbopack/react';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  applicationName: '3B',
  title: { default: '3B', template: '%s · 3B' },
  description: 'Marketplace comunitario de 3B.',
  // iOS: habilita el modo standalone al "Agregar a inicio".
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '3B' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Color de la barra del navegador/SO = crema de marca (--background).
  themeColor: '#f4f2e0',
  width: 'device-width',
  initialScale: 1,
  // Contenido a sangre bajo el notch/safe-area en modo standalone.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        {/* Registra el service worker (M8a). Desactivado en desarrollo para no
            interferir con el HMR de Turbopack; se verifica con `next build`. */}
        <SerwistProvider
          swUrl="/serwist/sw.js"
          disable={process.env.NODE_ENV === 'development'}
        >
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
