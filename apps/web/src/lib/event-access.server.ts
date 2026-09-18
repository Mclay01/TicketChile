import "server-only";
import { pool } from "@/lib/db";
import { requireOrganizerApproved } from "@/lib/organizer-guard.server";
import { AccessError, identifier } from "@/lib/access.server";

export type EventAccess = {
  organizerId: string;
  event: { id: string; title: string; slug: string; city: string; venue: string };
};

/** Only persisted ownership currently grants access. No staff assignment model
 * exists yet: non-owners, client role claims and event codes fail closed. */
export async function requireEventAccess(eventId: string): Promise<EventAccess> {
  const gate = await requireOrganizerApproved();
  if (!gate.ok) throw new AccessError(gate.status, "NOT_AUTHORIZED", "No autorizado.");
  if (!identifier(eventId)) throw new AccessError(400, "INVALID_INPUT", "Evento inválido.");
  const result = await pool.query<EventAccess["event"]>(
    `SELECT e.id, e.title, e.slug, e.city, e.venue
     FROM events e JOIN organizer_events oe ON oe.event_id = e.id
     WHERE e.id = $1 AND oe.organizer_id = $2 LIMIT 1`,
    [eventId, gate.organizerId],
  );
  const event = result.rows[0];
  if (!event) throw new AccessError(404, "NOT_AUTHORIZED", "Evento no disponible.");
  return { organizerId: gate.organizerId, event };
}
