import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getMe } from '../../lib/me';
import { CartProvider } from '../_components/cart-provider';
import { ImpersonationBanner } from '../_components/impersonation-banner';
import { Navbar } from '../_components/navbar';

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
        {me.impersonating && (
          <ImpersonationBanner
            viewingAs={{ name: me.user.name, email: me.user.email }}
          />
        )}
        <Navbar me={me} />
        <main className="mx-auto max-w-5xl p-6">{children}</main>
      </div>
    </CartProvider>
  );
}
