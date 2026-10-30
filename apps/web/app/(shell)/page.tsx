import { getMe } from '../../lib/me';

const CAP_LABEL: Record<string, string> = {
  isMaker: 'Maker',
  isSeller: 'Seller',
  isMover: 'Mover',
  isPlatformAdmin: 'Admin de plataforma',
};

export default async function Home() {
  const me = await getMe();
  if (!me) return null;

  const caps = Object.entries(me.capabilities)
    .filter(([, v]) => v)
    .map(([k]) => CAP_LABEL[k] ?? k);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">
          Hola, {me.user.name ?? me.user.email}
        </h1>
        <p className="text-muted-foreground">
          Capacidades:{' '}
          <span className="text-foreground">{caps.join(' · ')}</span>
        </p>
      </div>

      <div className="glass rounded-lg p-4">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">
          Tus comunidades
        </h2>
        {me.communities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin comunidades.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {me.communities.map((c) => (
              <li key={c.id}>
                {c.name}{' '}
                <span className="text-muted-foreground">({c.role})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
