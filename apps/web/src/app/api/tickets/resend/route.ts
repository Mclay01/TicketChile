import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { sendTicketEmail } from "@/lib/tickets.email";
import { getBuyerEmail, TICKET_OWNER_SQL } from "@/lib/buyer-guard.server";
import { signTicketToken } from "@/lib/qr-token.server";
import * as QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

type TicketEmailRow = {
  ticket_id: string;
  ticket_status: string;
  ticket_type_name: string;
  order_id: string;
  buyer_name: string;
  buyer_email: string;
  event_id: string;
  event_title: string;
  city: string | null;
  venue: string | null;
  date_iso: Date | string | null;
};

export async function POST(req: Request) {
  try {
    const sessionEmail = await getBuyerEmail();
    if (!sessionEmail) return json(401, { ok: false, error: "No autenticado." });

    const body: unknown = await req.json().catch(() => null);
    const ticketId = body && typeof body === "object" && "ticketId" in body &&
      typeof body.ticketId === "string" ? body.ticketId.trim() : "";
    if (!ticketId || ticketId.length > 200) {
      return json(400, { ok: false, error: "Ticket inv?lido." });
    }

    const result = await pool.query<TicketEmailRow>(
      `SELECT t.id AS ticket_id, t.status AS ticket_status, t.ticket_type_name,
              o.id AS order_id, o.buyer_name, o.buyer_email,
              t.event_id, o.event_title, e.city, e.venue, e.date_iso
       FROM tickets t
       JOIN orders o ON o.id = t.order_id
       LEFT JOIN events e ON e.id = t.event_id
       WHERE t.id = $1 AND ${TICKET_OWNER_SQL} = $2
       LIMIT 1`,
      [ticketId, sessionEmail],
    );
    const row = result.rows[0];
    // Do not distinguish a missing ticket from another buyer's ticket.
    if (!row) return json(404, { ok: false, error: "Ticket no encontrado." });
    if (row.ticket_status === "CANCELLED") {
      return json(409, { ok: false, error: "La entrada est? cancelada." });
    }

    // Render after ownership validation, without forwarding cookies to a
    // request-derived host or relying on a public signing endpoint.
    const token = signTicketToken({ ticketId: row.ticket_id, eventId: row.event_id });
    const png = await QRCode.toBuffer(token, {
      type: "png", width: 260, margin: 1, errorCorrectionLevel: "M",
    });

    // Only the current owner receives a reissued access credential. An original
    // buyer may no longer own it, and the request cannot add recipients.
    await sendTicketEmail({
      to: [sessionEmail],
      ticket: {
        id: row.ticket_id, status: row.ticket_status,
        ticketTypeName: row.ticket_type_name, qrPngBase64: png.toString("base64"),
      },
      order: {
        id: row.order_id, buyerName: row.buyer_name,
        buyerEmail: row.buyer_email, ownerEmail: sessionEmail,
      },
      event: {
        id: row.event_id, title: row.event_title, city: row.city || "",
        venue: row.venue || "", dateISO: row.date_iso ? new Date(row.date_iso).toISOString() : "",
      },
    });
    return json(200, { ok: true, sentTo: [sessionEmail], failedTo: [], qrIncluded: true });
  } catch {
    return json(500, { ok: false, error: "No se pudo reenviar la entrada. Intenta nuevamente." });
  }
}
