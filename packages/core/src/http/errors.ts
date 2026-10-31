/**
 * Mapeo centralizado de errores de PostgreSQL → respuestas HTTP.
 *
 * Por qué centralizado (en `app.onError`) y no en cada handler: el middleware
 * abre UNA transacción por request. Si un statement falla (p. ej. viola RLS o
 * una restricción única), la transacción queda **abortada**; atrapar el error
 * dentro del handler y responder no sirve, porque el COMMIT posterior vuelve a
 * fallar y pisa la respuesta con un 500. Dejando propagar el error, la
 * transacción hace rollback limpio y `onError` traduce el SQLSTATE.
 */

/** Extrae el SQLSTATE recorriendo la cadena de `cause` (Drizzle envuelve el driver). */
export function pgCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 5 && e && typeof e === 'object'; i++) {
    const obj = e as { code?: unknown; cause?: unknown };
    if (typeof obj.code === 'string') return obj.code;
    e = obj.cause;
  }
  return undefined;
}

export interface DbErrorResponse {
  status: 400 | 403 | 409;
  error: string;
}

/**
 * Traduce un error de Postgres a `{ status, error }`, o `null` si no es un error
 * de base conocido (el caller responde 500). Los SQLSTATE cubiertos:
 * - `42501` insufficient_privilege (RLS / permisos) → 403
 * - `23505` unique_violation → 409
 * - `23503` foreign_key_violation → 409
 * - `23514` check_violation → 400
 * - `22P02` invalid_text_representation (p. ej. uuid mal formado) → 400
 */
export function dbErrorResponse(err: unknown): DbErrorResponse | null {
  switch (pgCode(err)) {
    case '42501':
      return { status: 403, error: 'No tenés permiso para esta acción.' };
    case '23505':
      return { status: 409, error: 'Ya existe un registro con esos datos.' };
    case '23503':
      return { status: 409, error: 'Referencia inexistente.' };
    case '23514':
      return { status: 400, error: 'Datos inválidos.' };
    case '22P02':
      return { status: 400, error: 'Formato inválido.' };
    default:
      return null;
  }
}
