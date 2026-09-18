import { pool } from "@/lib/db";
import { requireEventAccess } from "@/lib/event-access.server";
import { requireOrganizerCapability } from "@/lib/security/capabilities.server";
import { localMediaStore } from "@/lib/media-storage.server";
import { accessResponse, AccessError } from "@/lib/access.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new AccessError(404, "NOT_FOUND", "Imagen no disponible.");
    const result = await pool.query<{ object_key: string; organizer_id: string; event_id: string | null; published: boolean }>(
      `SELECT m.*,EXISTS(SELECT 1 FROM events e WHERE e.is_published AND
       (e.image=$2 OR e.hero_desktop=$2 OR e.hero_mobile=$2)) AS published FROM media_objects m WHERE m.id=$1`, [id, `/api/media/${id}`]);
    const media = result.rows[0];
    if (!media) throw new AccessError(404, "NOT_FOUND", "Imagen no disponible.");
    if (!media.published) {
      if (media.event_id) await requireEventAccess(media.event_id, "event.read");
      else await requireOrganizerCapability(media.organizer_id, "event.edit");
    }
    const bytes = await localMediaStore().get(media.object_key);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return accessResponse(error); }
}
