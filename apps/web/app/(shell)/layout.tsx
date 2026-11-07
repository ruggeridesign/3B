import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getMe } from '../../lib/me';
import { CartProvider } from '../_components/cart-provider';
import { ConnectionStatus } from '../_components/connection-status';
import { ImpersonationBanner } from '../_components/impersonation-banner';
import { Navbar } from '../_components/navbar';
import { QueuedToast } from '../_components/queued-toast';
import { SyncListener } from '../_components/sync-listener';

export default async function ShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  return (
    <CartProvider>
      <div className="min-h-dvh">
        <ConnectionStatus />
        <SyncListener />
        {me.impersonating && (
          <ImpersonationBanner
            viewingAs={{ name: me.user.name, email: me.user.email }}
          />
        )}
        <Navbar me={me} />
        <main className="mx-auto max-w-5xl p-6">{children}</main>
        <QueuedToast />
      </div>
    </CartProvider>
  );
}
