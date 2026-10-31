import type { MediaMime, MediaOwnerType, MediaStatus } from '@3b/contracts';
import { type AppTransaction, sql } from '@3b/db';
import { extForMime } from '../storage';

/**
 * Repo de media. Usa SQL crudo para generar la `key` del objeto en la base
 * (owner + uuid + extensión) y derivar `created_by` del contexto RLS, nunca del
 * cliente. La fila nace `pending`; se marca `ready` al confirmar la subida.
 */

/** Registro interno (incluye `key` del storage; el router expone la `url`). */
export interface MediaRecord {
  id: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  mime: MediaMime;
  status: MediaStatus;
  key: string;
  createdAt: string;
}

type Row = {
  id: string;
  owner_type: string;
  owner_id: string;
  mime: string;
  status: string;
  key: string;
  created_at: string | Date;
};

function toRecord(row: Row): MediaRecord {
  return {
    id: row.id,
    ownerType: row.owner_type as MediaOwnerType,
    ownerId: row.owner_id,
    mime: row.mime as MediaMime,
    status: row.status as MediaStatus,
    key: row.key,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const COLS = sql`id, owner_type, owner_id, mime, status, key, created_at`;

/** Crea la fila `pending` con una key generada. created_by sale del contexto. */
export async function createPendingMedia(
  db: AppTransaction,
  input: { ownerType: MediaOwnerType; ownerId: string; mime: MediaMime },
): Promise<MediaRecord> {
  const extSuffix = `.${extForMime(input.mime)}`;
  const rows = (await db.execute(sql`
    INSERT INTO media.media (bucket, key, mime, owner_type, owner_id, created_by)
    VALUES (
      'local',
      ${input.ownerType} || '/' || ${input.ownerId}::text || '/'
        || gen_random_uuid()::text || ${extSuffix},
      ${input.mime},
      ${input.ownerType},
      ${input.ownerId},
      authz.current_user_id()
    )
    RETURNING ${COLS}
  `)) as unknown as Row[];
  return toRecord(rows[0]);
}

/** Marca una media como `ready` (tras subir el archivo). null si no es tuya. */
export async function markMediaReady(
  db: AppTransaction,
  id: string,
): Promise<MediaRecord | null> {
  const rows = (await db.execute(sql`
    UPDATE media.media SET status = 'ready', updated_at = now()
    WHERE id = ${id}
    RETURNING ${COLS}
  `)) as unknown as Row[];
  return rows[0] ? toRecord(rows[0]) : null;
}

/** Media de un propietario (acotada por la RLS a lo que el usuario puede ver). */
export async function listMediaByOwner(
  db: AppTransaction,
  ownerType: MediaOwnerType,
  ownerId: string,
): Promise<MediaRecord[]> {
  const rows = (await db.execute(sql`
    SELECT ${COLS} FROM media.media
    WHERE owner_type = ${ownerType} AND owner_id = ${ownerId}
    ORDER BY created_at
  `)) as unknown as Row[];
  return rows.map(toRecord);
}

/** Borra una media por id. Devuelve el registro borrado (para limpiar el objeto). */
export async function deleteMediaRecord(
  db: AppTransaction,
  id: string,
): Promise<MediaRecord | null> {
  const rows = (await db.execute(sql`
    DELETE FROM media.media WHERE id = ${id} RETURNING ${COLS}
  `)) as unknown as Row[];
  return rows[0] ? toRecord(rows[0]) : null;
}
