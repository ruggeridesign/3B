'use client';

import { Button } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ImpersonationBanner({
  viewingAs,
}: {
  viewingAs: { name: string | null; email: string };
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function stop() {
    setLoading(true);
    await fetch('/v1/admin/impersonate', { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-brand px-4 py-2 text-sm text-brand-foreground">
      <span>
        Estás viendo como <strong>{viewingAs.name ?? viewingAs.email}</strong>
      </span>
      <Button size="xs" variant="secondary" onClick={stop} disabled={loading}>
        {loading ? 'Saliendo…' : 'Volver a tu cuenta'}
      </Button>
    </div>
  );
}
