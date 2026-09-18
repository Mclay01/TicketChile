import "server-only";
import { pool } from "@/lib/db";
import { getBuyerEmail, TICKET_OWNER_SQL } from "@/lib/buyer-guard.server";
import { AccessError, identifier } from "@/lib/access.server";
import { verifyTicketToken } from "@/lib/qr-token.server";
import { limit } from "@/lib/security/rate-limit.server";

export type OwnedTicket = {
  id: string; event_id: string; order_id: string; status: string;
  ticket_type_name: string; event_title: string; buyer_name: string;
  owner_email: string; city: string; venue: string; date_iso: Date | string;
};

export async function requireBuyerEmail() {
  const email = await getBuyerEmail();
  if (!email) throw new AccessError(401, "UNAUTHENTICATED", "Inicia sesión para acceder a tus entradas.");
  await limit("ticket-read",email,{hits:600,seconds:60});
  return email;
}

export async function ownedTicketFromRequest(request: Request): Promise<OwnedTicket> {
  const email = await requireBuyerEmail();
  const params = new URL(request.url).searchParams;
  const token = params.get("t");
  let ticketId = params.get("ticketId") || params.get("ticket_id") || "";
  let eventId = params.get("eventId") || params.get("event_id") || "";
  if (token) {
    const verified = token.length <= 1024 ? verifyTicketToken(token) : null;
    if (!verified || (ticketId && ticketId !== verified.ticketId) || (eventId && eventId !== verified.eventId)) {
      throw new AccessError(400, "INVALID_QR", "QR inválido.");
    }
    ticketId = verified.ticketId;
    eventId = verified.eventId;
  }
  if (!identifier(ticketId) || (eventId && !identifier(eventId))) {
    throw new AccessError(400, "INVALID_INPUT", "Entrada inválida.");
  }
  const result = await pool.query<OwnedTicket>(
    `SELECT t.id, t.event_id, t.order_id, t.status, t.ticket_type_name,
            o.event_title, o.buyer_name, ${TICKET_OWNER_SQL} AS owner_email,
            e.city, e.venue, e.date_iso
     FROM tickets t JOIN orders o ON o.id = t.order_id JOIN events e ON e.id = t.event_id
     WHERE t.id = $1 AND ${TICKET_OWNER_SQL} = $2
       AND ($3::text = '' OR t.event_id = $3) LIMIT 1`,
    [ticketId, email, eventId],
  );
  const ticket = result.rows[0];
  if (!ticket) throw new AccessError(404, "NOT_FOUND", "Entrada no encontrada.");
  if (ticket.status !== "VALID") throw new AccessError(409, "INACTIVE_TICKET", "La entrada ya no está disponible para acceso.");
  return ticket;
}
