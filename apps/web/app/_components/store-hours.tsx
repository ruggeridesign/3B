'use client';

import type { StoreHour } from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

// 0 = domingo … 6 = sábado (convención de Date.getDay). Se muestran empezando
// por lunes, que es lo natural para un comercio.
const DAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Convierte minutos desde medianoche a `HH:MM`. */
function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Convierte `HH:MM` a minutos desde medianoche (NaN si no parsea). */
function parse(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return Number.NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Horario semanal de la tienda: lista por día + alta de intervalo (managers). */
export function StoreHours({
  storeId,
  hours,
  canManage,
}: {
  storeId: string;
  hours: StoreHour[];
  canManage: boolean;
}) {
  const router = useRouter();
  const dayId = useId();
  const opensId = useId();
  const closesId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/v1/stores/${storeId}/hours`;

  const byDay = new Map<number, StoreHour[]>();
  for (const h of hours) {
    const list = byDay.get(h.weekday) ?? [];
    list.push(h);
    byDay.set(h.weekday, list);
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await fetch(`${base}/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError('No se pudo borrar el intervalo.');
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const opensMin = parse(String(form.get('opens') ?? ''));
    const closesMin = parse(String(form.get('closes') ?? ''));
    if (Number.isNaN(opensMin) || Number.isNaN(closesMin)) {
      setError('Usá el formato HH:MM.');
      return;
    }
    if (closesMin <= opensMin) {
      setError('El cierre debe ser posterior a la apertura.');
      return;
    }
    setBusy(true);
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weekday: Number(form.get('weekday')),
        opensMin,
        closesMin,
      }),
    });
    setBusy(false);
    if (res.ok) {
      (e.target as HTMLFormElement).reset();
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo agregar el intervalo.');
  }

  return (
    <section className="space-y-3">
      <h2 className="font-medium text-foreground">Horario</h2>

      <ul className="grid gap-1.5">
        {DAY_ORDER.map((d) => {
          const dayHours = byDay.get(d) ?? [];
          return (
            <li
              key={d}
              className="glass flex items-start justify-between gap-3 rounded-lg p-3"
            >
              <span className="w-24 shrink-0 font-medium text-foreground text-sm">
                {DAY_LABELS[d]}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
                {dayHours.length > 0 ? (
                  dayHours.map((h) => (
                    <span
                      key={h.id}
                      className="inline-flex items-center gap-1.5 text-muted-foreground text-sm"
                    >
                      {fmt(h.opensMin)}–{fmt(h.closesMin)}
                      {canManage && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => remove(h.id)}
                          className="text-destructive text-xs hover:underline"
                          aria-label={`Borrar ${DAY_LABELS[d]} ${fmt(h.opensMin)}`}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground text-sm">Cerrado</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {canManage && (
        <form
          onSubmit={onSubmit}
          className="glass flex max-w-md flex-wrap items-end gap-3 rounded-lg p-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor={dayId}>Día</Label>
            <select
              id={dayId}
              name="weekday"
              className={fieldClass}
              defaultValue="1"
            >
              {DAY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DAY_LABELS[d]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={opensId}>Abre</Label>
            <Input
              id={opensId}
              name="opens"
              placeholder="09:00"
              pattern="\d{1,2}:\d{2}"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={closesId}>Cierra</Label>
            <Input
              id={closesId}
              name="closes"
              placeholder="18:00"
              pattern="\d{1,2}:\d{2}"
              required
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Agregando…' : 'Agregar'}
          </Button>
        </form>
      )}
    </section>
  );
}
