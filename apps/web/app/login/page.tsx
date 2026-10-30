'use client';

import { Button, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { signIn } from '../../lib/auth-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@3b.test');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? 'No se pudo iniciar sesión');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main
      className="grid min-h-dvh place-items-center p-6 text-foreground"
      style={{
        background:
          'radial-gradient(circle at 30% 20%, var(--accent), transparent 45%),' +
          'radial-gradient(circle at 75% 85%, var(--brand), transparent 45%),' +
          'var(--background)',
      }}
    >
      <form
        onSubmit={onSubmit}
        className="glass w-full max-w-sm space-y-4 rounded-lg p-6"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Entrar a 3B</h1>
          <p className="text-sm text-muted-foreground">
            Usá un usuario del seed (contraseña de dev:{' '}
            <code className="rounded-sm bg-muted px-1">Password123!</code>).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </main>
  );
}
