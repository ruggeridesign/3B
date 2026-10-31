'use client';

import type { PaymentMethod, PaymentMethodType } from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

const TYPE_LABEL: Record<PaymentMethodType, string> = {
  pago_movil: 'Pago móvil',
  transferencia: 'Transferencia',
  zelle: 'Zelle',
  binance: 'Binance Pay',
  efectivo: 'Efectivo',
  otro: 'Otro',
};

// Campos sugeridos por tipo. `details` es un mapa flexible; estos son los que
// la UI ofrece capturar (la validación por tipo llegará más adelante).
const TYPE_FIELDS: Record<PaymentMethodType, { key: string; label: string }[]> =
  {
    pago_movil: [
      { key: 'telefono', label: 'Teléfono' },
      { key: 'banco', label: 'Banco' },
      { key: 'cedula', label: 'Cédula/RIF' },
    ],
    transferencia: [
      { key: 'banco', label: 'Banco' },
      { key: 'cuenta', label: 'Número de cuenta' },
      { key: 'titular', label: 'Titular' },
      { key: 'cedula', label: 'Cédula/RIF' },
    ],
    zelle: [
      { key: 'email', label: 'Email' },
      { key: 'titular', label: 'Titular' },
    ],
    binance: [{ key: 'email_o_id', label: 'Email o Pay ID' }],
    efectivo: [{ key: 'nota', label: 'Nota (opcional)' }],
    otro: [
      { key: 'nombre', label: 'Nombre' },
      { key: 'nota', label: 'Instrucciones' },
    ],
  };

const TYPES = Object.keys(TYPE_LABEL) as PaymentMethodType[];

/** Métodos de pago de la tienda. Los controles de gestión requieren `canManage`. */
export function StorePayments({
  storeId,
  methods,
  canManage,
}: {
  storeId: string;
  methods: PaymentMethod[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function mutate(path: string, init: RequestInit) {
    setError(null);
    setBusy(true);
    const res = await fetch(
      `/v1/stores/${storeId}/payment-methods${path}`,
      init,
    );
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return true;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo completar la acción.');
    return false;
  }

  function toggleActive(pm: PaymentMethod) {
    return mutate(`/${pm.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !pm.active }),
    });
  }

  function remove(pmId: string) {
    return mutate(`/${pmId}`, { method: 'DELETE' });
  }

  return (
    <section className="space-y-4">
      <h2 className="font-medium text-foreground">Métodos de pago</h2>

      {methods.length > 0 ? (
        <ul className="grid gap-2">
          {methods.map((pm) => (
            <li
              key={pm.id}
              className="glass flex items-start justify-between gap-3 rounded-lg p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {TYPE_LABEL[pm.type]}
                  {!pm.active && (
                    <span className="ml-2 text-muted-foreground text-xs">
                      (inactivo)
                    </span>
                  )}
                </p>
                <dl className="mt-0.5 text-muted-foreground text-sm">
                  {Object.entries(pm.details).map(([k, v]) => (
                    <div key={k} className="flex gap-1.5">
                      <dt className="capitalize">{k.replace(/_/g, ' ')}:</dt>
                      <dd className="truncate text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {canManage && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => toggleActive(pm)}
                  >
                    {pm.active ? 'Desactivar' : 'Activar'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => remove(pm.id)}
                  >
                    Borrar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          Todavía no cargaste métodos de pago.
        </p>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {canManage && <AddPayment storeId={storeId} onError={setError} />}
    </section>
  );
}

/** Formulario de alta: elige tipo y completa los campos sugeridos de ese tipo. */
function AddPayment({
  storeId,
  onError,
}: {
  storeId: string;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const typeId = useId();
  const [type, setType] = useState<PaymentMethodType>('pago_movil');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const details: Record<string, string> = {};
    for (const { key } of TYPE_FIELDS[type]) {
      const v = String(form.get(key) ?? '').trim();
      if (v) details[key] = v;
    }
    const res = await fetch(`/v1/stores/${storeId}/payment-methods`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, details }),
    });
    setLoading(false);
    if (res.ok) {
      (e.target as HTMLFormElement).reset();
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    onError(data?.error ?? 'No se pudo agregar el método de pago.');
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass max-w-md space-y-4 rounded-lg p-4"
    >
      <h3 className="font-medium text-foreground">Agregar método de pago</h3>

      <div className="space-y-1.5">
        <Label htmlFor={typeId}>Tipo</Label>
        <select
          id={typeId}
          name="type"
          className={fieldClass}
          value={type}
          onChange={(e) => setType(e.target.value as PaymentMethodType)}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      {TYPE_FIELDS[type].map((f) => (
        <PaymentField key={f.key} fieldKey={f.key} label={f.label} />
      ))}

      <Button type="submit" disabled={loading}>
        {loading ? 'Agregando…' : 'Agregar'}
      </Button>
    </form>
  );
}

function PaymentField({
  fieldKey,
  label,
}: {
  fieldKey: string;
  label: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={fieldKey} />
    </div>
  );
}
