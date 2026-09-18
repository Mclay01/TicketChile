import "server-only";
import { pool } from "@/lib/db";
import { organizerActor, type Capability } from "@/lib/security/capabilities.server";
import type { Principal } from "@/lib/security/identity.server";
import { limit } from "@/lib/security/rate-limit.server";
import { AccessError, identifier } from "@/lib/access.server";

export type EventAccess = {
  organizerId: string;
  actor: Principal;
  event: { id: string; title: string; slug: string; city: string; venue: string };
};

/** Live persisted owner/staff policy; client role claims never authorize access. */
export async function requireEventAccess(eventId: string, capability: Capability = "scanner.read"): Promise<EventAccess> {
  const actor = await organizerActor();
  await limit(capability==="attendees.export"?"event-export":"event-access",`${actor.kind}:${actor.id}`,{hits:capability==="attendees.export"?10:1200,seconds:60});
  if (!identifier(eventId)) throw new AccessError(400, "INVALID_INPUT", "Evento inválido.");
  const result = await pool.query<EventAccess["event"] & {organizer_id:string}>(
    `SELECT e.id, e.title, e.slug, e.city, e.venue, oe.organizer_id
     FROM events e JOIN organizer_events oe ON oe.event_id = e.id
     WHERE e.id = $1 AND security_can_event($2,$3,$4,e.id,$5) LIMIT 1`,
    [eventId, actor.kind, actor.id, actor.version, capability],
  );
  const event = result.rows[0];
  if (!event) throw new AccessError(404, "NOT_AUTHORIZED", "Evento no disponible.");
  return { organizerId: event.organizer_id, actor, event };
}
