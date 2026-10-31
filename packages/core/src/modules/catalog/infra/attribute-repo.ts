import type {
  AttributeDefinition,
  CreateGlobalAttributeInput,
  CreateStoreAttributeInput,
} from '@3b/contracts';
import { type AppTransaction, and, eq, schema, sql } from '@3b/db';

type AttrRow = typeof schema.attributeDefinitions.$inferSelect;

/** Proyecta una fila (del builder) al DTO. */
function toAttr(row: AttrRow): AttributeDefinition {
  return {
    id: row.id,
    scope: row.scope as AttributeDefinition['scope'],
    scopeId: row.scopeId,
    key: row.key,
    label: row.label,
    dataType: row.dataType as AttributeDefinition['dataType'],
    options: (row.options as string[] | null) ?? null,
    unit: row.unit,
    filterable: row.filterable,
    variantAxis: row.variantAxis,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Definiciones propias de una tienda (scope=store). */
export async function listStoreAttributes(
  db: AppTransaction,
  storeId: string,
): Promise<AttributeDefinition[]> {
  const rows = await db
    .select()
    .from(schema.attributeDefinitions)
    .where(
      and(
        eq(schema.attributeDefinitions.scope, 'store'),
        eq(schema.attributeDefinitions.scopeId, storeId),
      ),
    )
    .orderBy(schema.attributeDefinitions.label);
  return rows.map(toAttr);
}

/** Crea una definición con alcance de tienda. RLS: owner/admin/catalog. */
export function createStoreAttribute(
  db: AppTransaction,
  storeId: string,
  input: CreateStoreAttributeInput,
): Promise<AttributeDefinition> {
  return insertAttribute(db, { scope: 'store', scopeId: storeId, ...input });
}

/** Crea una definición global o de categoría. RLS: admin de plataforma. */
export function createGlobalAttribute(
  db: AppTransaction,
  input: CreateGlobalAttributeInput,
): Promise<AttributeDefinition> {
  return insertAttribute(db, {
    scope: input.scope,
    scopeId: input.scopeId ?? null,
    key: input.key,
    label: input.label,
    dataType: input.dataType,
    options: input.options,
    unit: input.unit,
    filterable: input.filterable,
    variantAxis: input.variantAxis,
  });
}

async function insertAttribute(
  db: AppTransaction,
  v: {
    scope: AttributeDefinition['scope'];
    scopeId: string | null;
    key: string;
    label: string;
    dataType: AttributeDefinition['dataType'];
    options?: string[];
    unit?: string;
    filterable?: boolean;
    variantAxis?: boolean;
  },
): Promise<AttributeDefinition> {
  const [row] = await db
    .insert(schema.attributeDefinitions)
    .values({
      scope: v.scope,
      scopeId: v.scopeId,
      key: v.key,
      label: v.label,
      dataType: v.dataType,
      options: v.options ?? null,
      unit: v.unit ?? null,
      filterable: v.filterable ?? false,
      variantAxis: v.variantAxis ?? false,
    })
    .returning();
  return toAttr(row);
}

/** Borra una definición por id (la RLS gatea por alcance). Devuelve si existía. */
export async function deleteAttribute(
  db: AppTransaction,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(schema.attributeDefinitions)
    .where(eq(schema.attributeDefinitions.id, id))
    .returning({ id: schema.attributeDefinitions.id });
  return rows.length > 0;
}

type RawAttrRow = {
  id: string;
  scope: string;
  scope_id: string | null;
  key: string;
  label: string;
  data_type: string;
  options: string[] | null;
  unit: string | null;
  filterable: boolean;
  variant_axis: boolean;
  created_at: string | Date;
};

/**
 * Resuelve los atributos **aplicables** a una tienda (+ categoría opcional) por
 * **herencia**: globales + los de la categoría y sus ancestros (CTE recursiva por
 * `parent_id`) + los de la tienda. Si una `key` se repite, gana el alcance más
 * específico (tienda > categoría > global).
 */
export async function resolveAttributes(
  db: AppTransaction,
  storeId: string,
  categoryId: string | null,
): Promise<AttributeDefinition[]> {
  const rows = (await db.execute(sql`
    WITH RECURSIVE anc AS (
      SELECT id, parent_id FROM catalog.categories WHERE id = ${categoryId}
      UNION ALL
      SELECT c.id, c.parent_id FROM catalog.categories c
      JOIN anc ON c.id = anc.parent_id
    )
    SELECT id, scope, scope_id, key, label, data_type, options, unit,
           filterable, variant_axis, created_at
    FROM catalog.attribute_definitions
    WHERE scope = 'global'
       OR (scope = 'store' AND scope_id = ${storeId})
       OR (scope = 'category' AND scope_id IN (SELECT id FROM anc))
    ORDER BY CASE scope WHEN 'global' THEN 0 WHEN 'category' THEN 1 ELSE 2 END
  `)) as unknown as RawAttrRow[];

  // Dedupe por key respetando la precedencia (el orden ya pone store al final).
  const byKey = new Map<string, AttributeDefinition>();
  for (const r of rows) {
    byKey.set(r.key, {
      id: r.id,
      scope: r.scope as AttributeDefinition['scope'],
      scopeId: r.scope_id,
      key: r.key,
      label: r.label,
      dataType: r.data_type as AttributeDefinition['dataType'],
      options: r.options ?? null,
      unit: r.unit,
      filterable: r.filterable,
      variantAxis: r.variant_axis,
      createdAt: new Date(r.created_at).toISOString(),
    });
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
}
