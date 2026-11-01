'use client';

import type {
  AttributeDefinition,
  Category,
  Item,
  ItemKind,
  ItemStatus,
  PriceMode,
} from '@3b/contracts';
import { Button, cn, Input, Label } from '@3b/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';

const fieldClass = cn(
  'h-9 w-full rounded-md border border-input bg-field px-3 text-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring',
);

const STATUS_LABEL: Record<ItemStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

const PRICE_MODE_LABEL: Record<PriceMode, string> = {
  fixed: 'Precio fijo',
  from: 'Desde',
  quote: 'A cotizar',
};

/** Formatea precio + moneda, o un texto según el modo. */
function priceLabel(item: Item): string {
  if (item.priceMode === 'quote' || !item.priceAmount) return 'A cotizar';
  const prefix = item.priceMode === 'from' ? 'Desde ' : '';
  return `${prefix}${item.currency} ${item.priceAmount}`;
}

/** Catálogo de la tienda. Los controles de gestión requieren `canManage`. */
export function StoreCatalog({
  storeId,
  items,
  categories,
  canManage,
}: {
  storeId: string;
  items: Item[];
  categories: Category[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  async function mutate(path: string, init: RequestInit) {
    setError(null);
    setBusy(true);
    const res = await fetch(`/v1/stores/${storeId}/items${path}`, init);
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

  function togglePublish(item: Item) {
    const status: ItemStatus =
      item.status === 'published' ? 'draft' : 'published';
    return mutate(`/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  function remove(itemId: string) {
    return mutate(`/${itemId}`, { method: 'DELETE' });
  }

  return (
    <section className="space-y-4">
      <h2 className="font-medium text-foreground">Catálogo</h2>

      {items.length > 0 ? (
        <ul className="grid gap-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="glass flex items-start justify-between gap-3 rounded-lg p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  <Link
                    href={`/mi-tienda/${storeId}/items/${it.id}`}
                    className="hover:underline"
                  >
                    {it.title}
                  </Link>
                  <span className="ml-2 text-muted-foreground text-xs">
                    {STATUS_LABEL[it.status]}
                  </span>
                </p>
                <p className="text-muted-foreground text-sm">
                  {it.kind === 'product' ? 'Producto' : 'Servicio'} ·{' '}
                  {priceLabel(it)}
                  {it.categoryId && categoryName.has(it.categoryId)
                    ? ` · ${categoryName.get(it.categoryId)}`
                    : ''}{' '}
                  · /{it.slug}
                </p>
                {Object.keys(it.attributes).length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {Object.entries(it.attributes)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ')}
                  </p>
                )}
              </div>

              {canManage && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => togglePublish(it)}
                  >
                    {it.status === 'published' ? 'Despublicar' : 'Publicar'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => remove(it.id)}
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
          Todavía no hay ítems en el catálogo.
        </p>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {canManage && (
        <AddItem storeId={storeId} categories={categories} onError={setError} />
      )}
    </section>
  );
}

/** Formulario de alta de un ítem. */
function AddItem({
  storeId,
  categories,
  onError,
}: {
  storeId: string;
  categories: Category[];
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const slugId = useId();
  const kindId = useId();
  const modeId = useId();
  const priceId = useId();
  const currencyId = useId();
  const categoryId = useId();
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('');
  // Atributos aplicables a la categoría elegida (se re-piden al cambiarla).
  const [attrDefs, setAttrDefs] = useState<AttributeDefinition[]>([]);

  useEffect(() => {
    let active = true;
    const qs = category ? `?categoryId=${category}` : '';
    fetch(`/v1/stores/${storeId}/attributes/resolved${qs}`)
      .then((r) => (r.ok ? r.json() : { attributes: [] }))
      .then((d: { attributes?: AttributeDefinition[] }) => {
        if (active) setAttrDefs(d.attributes ?? []);
      })
      .catch(() => {
        if (active) setAttrDefs([]);
      });
    return () => {
      active = false;
    };
  }, [storeId, category]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const price = String(form.get('priceAmount') ?? '').trim();

    // Junta los valores de atributo, tipados según su definición.
    const attributes: Record<string, string | number | boolean> = {};
    for (const def of attrDefs) {
      const raw = form.get(`attr:${def.key}`);
      if (def.dataType === 'boolean') {
        if (raw === 'on') attributes[def.key] = true;
        continue;
      }
      const v = String(raw ?? '').trim();
      if (!v) continue;
      attributes[def.key] = def.dataType === 'number' ? Number(v) : v;
    }

    const res = await fetch(`/v1/stores/${storeId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: form.get('kind') as ItemKind,
        slug: form.get('slug'),
        title: form.get('title'),
        priceMode: form.get('priceMode') as PriceMode,
        priceAmount: price || undefined,
        currency: (form.get('currency') as string) || 'USD',
        categoryId: category || undefined,
        attributes: Object.keys(attributes).length ? attributes : undefined,
        status: 'draft',
      }),
    });
    setLoading(false);
    if (res.ok) {
      (e.target as HTMLFormElement).reset();
      setCategory('');
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    onError(data?.error ?? 'No se pudo crear el ítem.');
  }

  return (
    <form
      onSubmit={onSubmit}
      className="glass max-w-md space-y-4 rounded-lg p-4"
    >
      <h3 className="font-medium text-foreground">Agregar ítem</h3>

      <div className="space-y-1.5">
        <Label htmlFor={titleId}>Título</Label>
        <Input
          id={titleId}
          name="title"
          required
          minLength={2}
          maxLength={120}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={slugId}>Slug</Label>
        <Input
          id={slugId}
          name="slug"
          required
          placeholder="mi-producto"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          title="Minúsculas, números y guiones."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={kindId}>Tipo</Label>
          <select
            id={kindId}
            name="kind"
            className={fieldClass}
            defaultValue="product"
          >
            <option value="product">Producto</option>
            <option value="service">Servicio</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={modeId}>Modo de precio</Label>
          <select
            id={modeId}
            name="priceMode"
            className={fieldClass}
            defaultValue="fixed"
          >
            {(Object.keys(PRICE_MODE_LABEL) as PriceMode[]).map((m) => (
              <option key={m} value={m}>
                {PRICE_MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={priceId}>Precio</Label>
          <Input
            id={priceId}
            name="priceAmount"
            placeholder="1990.00"
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={currencyId}>Moneda</Label>
          <Input
            id={currencyId}
            name="currency"
            defaultValue="USD"
            maxLength={3}
          />
        </div>
      </div>

      {categories.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor={categoryId}>Categoría</Label>
          <select
            id={categoryId}
            name="categoryId"
            className={fieldClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Sin categoría</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {attrDefs.length > 0 && (
        <fieldset className="space-y-3 border-border border-t pt-3">
          <legend className="text-muted-foreground text-sm">
            Atributos aplicables
          </legend>
          {attrDefs.map((def) => (
            <AttributeField key={def.id} def={def} />
          ))}
        </fieldset>
      )}

      <Button type="submit" disabled={loading}>
        {loading ? 'Creando…' : 'Agregar ítem'}
      </Button>
    </form>
  );
}

/** Campo de formulario para un atributo, según su tipo. */
function AttributeField({ def }: { def: AttributeDefinition }) {
  const id = useId();
  const name = `attr:${def.key}`;
  const label = def.unit ? `${def.label} (${def.unit})` : def.label;

  if (def.dataType === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-foreground text-sm">
        <input type="checkbox" name={name} className="size-4" />
        {label}
      </label>
    );
  }
  if (def.dataType === 'enum') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <select id={id} name={name} className={fieldClass} defaultValue="">
          <option value="">—</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        inputMode={def.dataType === 'number' ? 'decimal' : undefined}
      />
    </div>
  );
}
