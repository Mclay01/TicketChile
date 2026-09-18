import { pool } from "@/lib/db";
import { accessResponse, AccessError, identifier } from "@/lib/access.server";
import { mediaSource, MEDIA_FALLBACK } from "@/lib/media";
import { normalizeImage } from "@/lib/media-storage.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Read-only legacy raster compatibility. Never emits DB base64 into page HTML. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; slot: string }> }) {
  try {
    const { id, slot } = await params;
    const fields: Record<string, string> = { poster: "image", desktop: "hero_desktop", mobile: "hero_mobile" };
    const column = Object.hasOwn(fields, slot) ? fields[slot] : undefined;
    if (!identifier(id) || !column) throw new AccessError(404, "NOT_FOUND", "Imagen no disponible.");
    const result = await pool.query<{ image: string }>(`SELECT ${column} AS image FROM events WHERE id=$1 AND is_published LIMIT 1`, [id]);
    const value = result.rows[0]?.image;
    if (!value?.startsWith("data:") || mediaSource(value) === MEDIA_FALLBACK) throw new AccessError(404, "NOT_FOUND", "Imagen no disponible.");
    const bytes = await normalizeImage(Buffer.from(value.slice(value.indexOf(",") + 1), "base64"));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return accessResponse(error); }
}
