import "server-only";
import { pool } from "@/lib/db";
import { AccessError } from "@/lib/access.server";
/** New submissions accept only immutable objects belonging to this tenant. */
export async function ownedMediaReference(value: string, organizerId: string) {
  if (!value) return "";
  const match = /^\/api\/media\/([a-f0-9-]{36})$/.exec(value);
  if (!match) throw new AccessError(400, "INVALID_MEDIA", "Carga la imagen usando el selector de archivos.");
  const result = await pool.query("SELECT 1 FROM media_objects WHERE id=$1 AND organizer_id=$2", [match[1], organizerId]);
  if (!result.rowCount) throw new AccessError(404, "NOT_FOUND", "Imagen no disponible.");
  return value;
}
