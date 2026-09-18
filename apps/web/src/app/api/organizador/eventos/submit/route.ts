import { randomUUID } from "node:crypto";
import { withTx } from "@/lib/db";
import { audit } from "@/lib/security/audit.server";
import { organizerActor, requireOrganizerCapability } from "@/lib/security/capabilities.server";
import { ownedMediaReference } from "@/lib/media-access.server";
import { accessResponse, AccessError, requireSameOrigin } from "@/lib/access.server";
import { limit } from "@/lib/security/rate-limit.server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await organizerActor();
    if (actor.kind !== "ORGANIZER") throw new AccessError(403, "FORBIDDEN", "Acceso de organizador requerido.");
    await requireOrganizerCapability(actor.id, "event.edit", actor);
    await limit("event-submit", actor.id, { hits: 20, seconds: 3600 });
    // Bound the stream before multipart parsing; image bytes have their own endpoint.
    const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    if (reader) try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 32768) { await reader.cancel(); throw new AccessError(413, "TOO_LARGE", "Solicitud demasiado grande."); } chunks.push(value); } } finally { reader.releaseLock(); }
    const fd = await new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) }).formData();
    const field = (name: string, max = 200) => String(fd.get(name) || "").trim().slice(0, max);
    const payload = { title: field("title"), city: field("city"), venue: field("venue"), dateISO: field("dateISO"), description: field("description", 10000),
      image: await ownedMediaReference(field("image", 500), actor.id), ticketType: { name: field("tt_name"), priceClp: Number(field("tt_price")), capacity: Number(field("tt_capacity")) } };
    if (!payload.title || !payload.city || !payload.venue || !payload.description || !Number.isFinite(Date.parse(payload.dateISO)) || !Number.isSafeInteger(payload.ticketType.priceClp) || payload.ticketType.priceClp < 0 || !Number.isSafeInteger(payload.ticketType.capacity) || payload.ticketType.capacity < 1) throw new AccessError(400, "INVALID_INPUT", "Revisa los datos del evento.");
    await withTx(async client => {
      const id = `sub_${randomUUID()}`;
      await client.query("INSERT INTO organizer_event_submissions(id,organizer_id,status,payload) VALUES($1,$2,'IN_REVIEW',$3::jsonb)", [id, actor.id, JSON.stringify(payload)]);
      await audit(client, { actor, action: "event.submitted", targetType: "submission", targetId: id, organizerId: actor.id });
    });
    return new Response(null, { status: 303, headers: { Location: "/organizador" } });
  } catch (error) { return accessResponse(error); }
}
