import type { Category, CreateCategoryInput } from '@3b/contracts';
import { type AppTransaction, eq, schema } from '@3b/db';

type CategoryRow = typeof schema.categories.$inferSelect;

/** Proyecta una fila de `catalog.categories` al DTO público. */
function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    slug: row.slug,
    kind: row.kind as Category['kind'],
    createdAt: row.createdAt.toISOString(),
  };
}

/** Todas las categorías (taxonomía plana; el árbol se arma con `parentId`). */
export async function listCategories(db: AppTransaction): Promise<Category[]> {
  const rows = await db
    .select()
    .from(schema.categories)
    .orderBy(schema.categories.name);
  return rows.map(toCategory);
}

/** Crea una categoría. La RLS exige admin de plataforma. */
export async function createCategory(
  db: AppTransaction,
  input: CreateCategoryInput,
): Promise<Category> {
  const [row] = await db
    .insert(schema.categories)
    .values({
      parentId: input.parentId ?? null,
      name: input.name,
      slug: input.slug,
      kind: input.kind,
    })
    .returning();
  return toCategory(row);
}

/** Una categoría por id (o null). */
export async function getCategory(
  db: AppTransaction,
  id: string,
): Promise<Category | null> {
  const [row] = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.id, id))
    .limit(1);
  return row ? toCategory(row) : null;
}
