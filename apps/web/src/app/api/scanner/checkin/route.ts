import { pool, withTx } from "@/lib/db";
import { verifyTicketToken } from "@/lib/qr-token.server";
import { requireEventAccess } from "@/lib/event-access.server";
import { AccessError, accessResponse, identifier, privateJson, requireSameOrigin } from "@/lib/access.server";
import { audit } from "@/lib/security/audit.server";
import { limit } from "@/lib/security/rate-limit.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckinRow = { id: string; ticket_type_name: string; status: string; used_at: Date | string | null };

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("eventId" in body)) throw new AccessError(400, "INVALID_INPUT", "Solicitud inválida.");
    const eventId = identifier(body.eventId);
    const access = await requireEventAccess(eventId, "scanner.checkin");
    await limit("scanner",`${access.actor.kind}:${access.actor.id}:${eventId}`,{hits:600,seconds:60});
    const qrText = "qrText" in body && typeof body.qrText === "string" ? body.qrText.trim() : "";
    const manualId = "ticketId" in body ? identifier(body.ticketId) : "";
    let ticketId = "";
    if (qrText) {
      // A scanner payload must be signed. Manual owner lookup is an explicit,
      // separately authorized mode; it cannot override an invalid signature.
      const parsed = qrText.length <= 1024 ? verifyTicketToken(qrText) : null;
      if (!parsed) throw new AccessError(400, "INVALID_QR", "QR inválido.");
      if (parsed.eventId !== eventId) throw new AccessError(409, "WRONG_EVENT", "QR no corresponde a este evento.");
      if (manualId && manualId !== parsed.ticketId) throw new AccessError(400, "INVALID_QR", "QR inválido.");
      ticketId = identifier(parsed.ticketId);
    } else { ticketId = manualId; }
    if (!ticketId) throw new AccessError(400, "INVALID_INPUT", "Entrada inválida.");

    // Atomic compare-and-set. Repeat ownership in the write predicate so an
    // event reassignment between authorization and mutation cannot grant access.
    const result = await withTx(async client => {
      const changed = await client.query<CheckinRow>(
      `UPDATE tickets t SET status='USED', used_at=NOW()
       WHERE t.id=$1 AND t.event_id=$2 AND t.status='VALID'
         AND security_can_event($3,$4,$5,t.event_id,'scanner.checkin')
       RETURNING t.id, t.ticket_type_name, t.status, t.used_at`,
      [ticketId, eventId, access.actor.kind, access.actor.id, access.actor.version],
    );
      if (changed.rowCount) await audit(client,{actor:access.actor,organizerId:access.organizerId,eventId,action:"ticket.checked_in",targetType:"ticket",targetId:ticketId});
      return changed;
    });
    if (result.rows[0]) {
      const row = result.rows[0];
      return privateJson(200, { ok: true, code: "VALID", ticket: {
        id: row.id, ticketTypeName: row.ticket_type_name, status: row.status,
        usedAtISO: row.used_at ? new Date(row.used_at).toISOString() : null,
      } });
    }
    const existing = await pool.query<CheckinRow>(
      `SELECT t.id, t.ticket_type_name, t.status, t.used_at FROM tickets t
       WHERE t.id=$1 AND t.event_id=$2
         AND security_can_event($3,$4,$5,t.event_id,'scanner.checkin')`,
      [ticketId, eventId, access.actor.kind, access.actor.id, access.actor.version],
    );
    const row = existing.rows[0];
    if (!row) throw new AccessError(404, "UNKNOWN_TICKET", "Entrada no encontrada.");
    if (row.status === "USED") return privateJson(409, { ok: false, code: "ALREADY_USED", error: "Ticket ya fue usado.", usedAtISO: row.used_at ? new Date(row.used_at).toISOString() : null });
    throw new AccessError(409, "CANCELLED", "La entrada no está habilitada.");
  } catch (error) { return accessResponse(error); }
}
