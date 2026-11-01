import type { AttributeDefinition, AttributeValues } from '@3b/contracts';

/**
 * Valida los **valores** de atributo de un ítem contra sus definiciones
 * **resueltas** (global + categoría + tienda). Puro: no toca DB ni frameworks.
 * Devuelve la lista de errores (vacía = válido). Reglas:
 *  - la `key` debe existir en las definiciones resueltas,
 *  - el valor debe coincidir con el `dataType` (text/number/boolean),
 *  - si es `enum`, el valor debe estar entre las `options`.
 */
export function validateAttributeValues(
  defs: AttributeDefinition[],
  values: AttributeValues,
): string[] {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const errors: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    const def = byKey.get(key);
    if (!def) {
      errors.push(`atributo desconocido: "${key}"`);
      continue;
    }
    switch (def.dataType) {
      case 'text':
        if (typeof value !== 'string') errors.push(`"${key}" debe ser texto`);
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errors.push(`"${key}" debe ser un número`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`"${key}" debe ser verdadero/falso`);
        }
        break;
      case 'enum':
        if (typeof value !== 'string' || !(def.options ?? []).includes(value)) {
          errors.push(
            `"${key}" debe ser una de: ${(def.options ?? []).join(', ')}`,
          );
        }
        break;
      default:
        errors.push(`"${key}" tiene un tipo no soportado`);
    }
  }
  return errors;
}
