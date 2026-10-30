import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getMe } from '../../lib/me';
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
    <div className="min-h-dvh">
      <Navbar me={me} />
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
