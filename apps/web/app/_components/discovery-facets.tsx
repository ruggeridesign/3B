'use client';

import type { DiscoveryFacets } from '@3b/contracts';
import { cn } from '@3b/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Filtros dinámicos (facetas): por cada atributo, sus valores como toggles que
 * agregan/quitan un `attr=key:value` en la URL. El `active` resalta los puestos.
 */
export function DiscoveryFacetsPanel({
  facets,
  active,
}: {
  facets: DiscoveryFacets['facets'];
  active: string[]; // "key:value"
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (facets.length === 0) return null;
  const activeSet = new Set(active);

  function toggle(token: string) {
    const sp = new URLSearchParams(params.toString());
    const current = sp.getAll('attr');
    sp.delete('attr');
    const next = activeSet.has(token)
      ? current.filter((t) => t !== token)
      : [...current, token];
    for (const t of next) sp.append('attr', t);
    sp.delete('offset');
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="space-y-3">
      {facets.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <p className="font-medium text-foreground text-sm capitalize">
            {f.key.replace(/_/g, ' ')}
          </p>
          <div className="flex flex-wrap gap-2">
            {f.values.map((v) => {
              const token = `${f.key}:${v.value}`;
              const on = activeSet.has(token);
              return (
                <button
                  key={token}
                  type="button"
                  onClick={() => toggle(token)}
                  aria-pressed={on}
                  className={cn(
                    'rounded-md border px-2 py-1 text-sm transition-colors',
                    on
                      ? 'border-ring bg-accent/20 text-foreground'
                      : 'border-input text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v.value} <span className="text-xs">({v.count})</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
