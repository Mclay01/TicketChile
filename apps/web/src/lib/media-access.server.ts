import "server-only";
import { pool } from "@/lib/db";
import { AccessError } from "@/lib/access.server";
import type { Pool, PoolClient } from 'pg';
/** New submissions accept only immutable objects belonging to this tenant. */
export async function ownedMediaReference(value: string, organizerId: string, db: Pool | PoolClient = pool, eventId?: string, purpose?: string) {
  if (!value) return "";
  const match = /^\/api\/media\/([a-f0-9-]{36})$/.exec(value);
  if (!match) throw new AccessError(400, "INVALID_MEDIA", "Carga la imagen usando el selector de archivos.");
  const result = await db.query(`SELECT 1 FROM media_objects WHERE id=$1 AND organizer_id=$2 AND state='READY'
    AND ($3::text IS NULL OR event_id IS NULL OR event_id=$3)
    AND ($4::text IS NULL OR purpose IS NULL OR purpose=$4) FOR UPDATE`, [match[1], organizerId,eventId||null,purpose||null]);
  if (!result.rowCount) throw new AccessError(404, "NOT_FOUND", "Imagen no disponible.");
  return value;
}
