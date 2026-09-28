import { pool } from "@/lib/db";
import { requireEventAccess } from "@/lib/event-access.server";
import { requireOrganizerCapability } from "@/lib/security/capabilities.server";
import { mediaStore } from "@/lib/media-storage.server";
import { requireAdminCapability } from '@/lib/admin/policy.server';
import { accessResponse, AccessError } from "@/lib/access.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new AccessError(404, "NOT_FOUND", "Imagen no disponible.");
    const result = await pool.query<{ object_key: string; organizer_id: string; event_id: string | null; published: boolean; state: string; provider: string; store_identity: string }>(
      `SELECT m.*,EXISTS(SELECT 1 FROM events e WHERE e.is_published AND
       (e.image=$2 OR e.hero_desktop=$2 OR e.hero_mobile=$2)) AS published FROM media_objects m WHERE m.id=$1`, [id, `/api/media/${id}`]);
    const media = result.rows[0];
    if (!media || media.state !== 'READY') throw new AccessError(404, "NOT_FOUND", "Imagen no disponible.");
    if (!media.published) {
      try {
        if (media.event_id) await requireEventAccess(media.event_id, "event.read");
        else await requireOrganizerCapability(media.organizer_id, "event.edit");
      } catch (error) {
        if (!(error instanceof AccessError) || ![401,403,404].includes(error.status)) throw error;
        try { await requireAdminCapability('operations.read'); } catch { throw error; }
        // Admin preview is limited to assets currently attached to a reviewed event.
        if (!(await pool.query(`SELECT 1 FROM events WHERE image=$1 OR hero_desktop=$1 OR hero_mobile=$1 LIMIT 1`, [`/api/media/${id}`])).rowCount) throw error;
      }
    }
    const variant = new URL(_request.url).searchParams.get('variant') || 'hero';
    if (!['hero','card','thumb'].includes(variant)) throw new AccessError(404, 'NOT_FOUND', 'Imagen no disponible.');
    const key = (await pool.query('SELECT object_key FROM media_variants WHERE media_id=$1 AND name=$2', [id,variant])).rows[0]?.object_key || media.object_key;
    const store = mediaStore();
    if (media.provider !== store.provider || media.store_identity !== store.identity) throw new AccessError(503, 'MEDIA_UNAVAILABLE', 'Imagen no disponible.');
    if (store.readUrl) return new Response(null, { status:302, headers:{ Location:await store.readUrl(key,media.published), 'Cache-Control':'private, no-store', 'Referrer-Policy':'no-referrer' } });
    const bytes = await store.get(key);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return accessResponse(error); }
}
