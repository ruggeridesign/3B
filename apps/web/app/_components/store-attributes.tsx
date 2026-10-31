'use client';

import type { AttributeDataType, AttributeDefinition } from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

const TYPE_LABEL: Record<AttributeDataType, string> = {
  text: 'Texto',
  number: 'Número',
  boolean: 'Sí/No',
  enum: 'Opciones',
};

const SCOPE_LABEL: Record<string, string> = {
  global: 'Global',
  category: 'Categoría',
  store: 'Tienda',
};

/**
 * Atributos de la tienda: las definiciones propias (alta/baja) y el conjunto
 * **resuelto por herencia** (global + tienda) como vista previa de lo que aplica.
 */
export function StoreAttributes({
  storeId,
  own,
  resolved,
}: {
  storeId: string;
  own: AttributeDefinition[];
  resolved: AttributeDefinition[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove(attrId: string) {
    setError(null);
    setBusy(true);
    const res = await fetch(`/v1/stores/${storeId}/attributes/${attrId}`, {
      method: 'DELETE',
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(data?.error ?? 'No se pudo borrar.');
  }

  return (
    <section className="space-y-4">
      <h2 className="font-medium text-foreground">Atributos</h2>

      <div className="space-y-1.5">
        <p className="text-muted-foreground text-sm">
          Aplicables a la tienda (heredados + propios):
        </p>
        <ul className="flex flex-wrap gap-2">
          {resolved.map((a) => (
            <li
              key={`${a.scope}:${a.key}`}
              className="glass rounded-md px-2.5 py-1 text-foreground text-sm"
            >
              {a.label}
              <span className="ml-1.5 text-muted-foreground text-xs">
                {TYPE_LABEL[a.dataType]}
                {a.unit ? ` · ${a.unit}` : ''} ·{' '}
                {SCOPE_LABEL[a.scope] ?? a.scope}
              </span>
            </li>
          ))}
          {resolved.length === 0 && (
            <li className="text-muted-foreground text-sm">Ninguno todavía.</li>
          )}
        </ul>
      </div>

      {own.length > 0 && (
        <ul className="grid gap-2">
          {own.map((a) => (
            <li
              key={a.id}
              className="glass flex items-center justify-between gap-3 rounded-lg p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{a.label}</p>
                <p className="text-muted-foreground text-sm">
                  {a.key} · {TYPE_LABEL[a.dataType]}
                  {a.unit ? ` · ${a.unit}` : ''}
                  {a.filterable ? ' · filtrable' : ''}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => remove(a.id)}
              >
                Borrar
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <AddAttribute storeId={storeId} onError={setError} />
    </section>
  );
}

/** Alta de un atributo con alcance de tienda. */
function AddAttribute({
  storeId,
  onError,
}: {
  storeId: string;
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const keyId = useId();
  const labelId = useId();
  const typeId = useId();
  const unitId = useId();
  const optionsId = useId();
  const [dataType, setDataType] = useState<AttributeDataType>('text');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const unit = String(form.get('unit') ?? '').trim();
    const optionsRaw = String(form.get('options') ?? '').trim();
    const body: Record<string, unknown> = {
      key: form.get('key'),
      label: form.get('label'),
      dataType,
      filterable: form.get('filterable') === 'on',
    };
    if (unit) body.unit = unit;
    if (dataType === 'enum' && optionsRaw) {
      body.options = optionsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const res = await fetch(`/v1/stores/${storeId}/attributes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (res.ok) {
      (e.target as HTMLFormElement).reset();
      setDataType('text');
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    onError(data?.error ?? 'No se pudo crear el atributo.');
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass max-w-md space-y-4 rounded-lg p-4"
    >
      <h3 className="font-medium text-foreground">
        Agregar atributo de tienda
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={labelId}>Nombre</Label>
          <Input id={labelId} name="label" required maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={keyId}>Clave</Label>
          <Input
            id={keyId}
            name="key"
            required
            placeholder="material"
            pattern="[a-z][a-z0-9_]*"
            title="Minúsculas, números y guion bajo; empieza con letra."
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={typeId}>Tipo</Label>
          <select
            id={typeId}
            name="dataType"
            className={fieldClass}
            value={dataType}
            onChange={(e) => setDataType(e.target.value as AttributeDataType)}
          >
            {(Object.keys(TYPE_LABEL) as AttributeDataType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={unitId}>Unidad (opcional)</Label>
          <Input id={unitId} name="unit" maxLength={16} placeholder="V, kg…" />
        </div>
      </div>

      {dataType === 'enum' && (
        <div className="space-y-1.5">
          <Label htmlFor={optionsId}>Opciones (separadas por coma)</Label>
          <Input
            id={optionsId}
            name="options"
            placeholder="chico, mediano, grande"
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-foreground text-sm">
        <input type="checkbox" name="filterable" className="size-4" />
        Usar en filtros
      </label>

      <Button type="submit" disabled={loading}>
        {loading ? 'Agregando…' : 'Agregar atributo'}
      </Button>
    </form>
  );
}
