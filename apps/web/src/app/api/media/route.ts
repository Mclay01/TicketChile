import { randomUUID } from "node:crypto";
import { withTx } from "@/lib/db";
import { audit, type Actor } from "@/lib/security/audit.server";
import { requireEventAccess } from "@/lib/event-access.server";
import { organizerActor, requireOrganizerCapability } from "@/lib/security/capabilities.server";
import { limit } from "@/lib/security/rate-limit.server";
import { accessResponse, privateJson, requireSameOrigin, identifier, AccessError } from "@/lib/access.server";
import { localMediaStore, normalizeImage, readImageBody } from "@/lib/media-storage.server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const params = new URL(request.url).searchParams;
    const eventId = params.get("eventId");
    let organizerId = params.get("organizerId");
    let tenant: string; let uploadActor: Actor;
    if (eventId) { const access = await requireEventAccess(eventId, "event.edit"); tenant = access.organizerId; uploadActor = access.actor; }
    else {
      if (!organizerId) { const actor = await organizerActor(); if (actor.kind === "ORGANIZER") organizerId = actor.id; }
      if (!identifier(organizerId)) throw new AccessError(400, "INVALID_INPUT", "Falta el organizador.");
      uploadActor = await requireOrganizerCapability(organizerId!, "event.edit"); tenant = organizerId!;
    }
    await limit("media-upload", tenant, { hits: 20, seconds: 3600 });
    const store = localMediaStore(); // Fail closed before consuming a body in production.
    const bytes = await normalizeImage(await readImageBody(request));
    const id = randomUUID(), key = `${id}.webp`;
    await store.put(key, bytes);
    await withTx(async client => {
      await client.query(`INSERT INTO media_objects(id,organizer_id,event_id,object_key,content_type,bytes) VALUES($1,$2,$3,$4,'image/webp',$5)`, [id, tenant, eventId, key, bytes.length]);
      await audit(client, { actor: uploadActor, action: "media.created", targetType: "media", targetId: id, organizerId: tenant, eventId: eventId || undefined });
    });
    return privateJson(201, { ok: true, id, url: `/api/media/${id}` });
  } catch (error) { return accessResponse(error); }
}
