import "server-only";
import { pool } from "@/lib/db";
import { TICKET_OWNER_SQL } from "@/lib/buyer-guard.server";
import { renderTicketQr } from "@/lib/qr-render.server";
import { sendTicketEmail } from "@/lib/tickets.email";

/** Internal delivery authority is a persisted PAID payment for this order.
 * No request headers, callback email or URL-derived host is accepted. */
export async function deliverPaidOrder(orderId: string) {
  const columns = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM information_schema.columns
     WHERE table_schema='public' AND table_name='tickets' AND column_name IN ('emailed_at','emailed_to')`,
  );
  if (columns.rows[0]?.count !== 2) return { attempted: false, reason: "missing_email_columns", sent: 0, failed: 0 };
  const claimed = await pool.query<{ id: string }>(
    `UPDATE tickets t SET emailed_at=NOW(), emailed_to=${TICKET_OWNER_SQL}
     FROM orders o WHERE t.order_id=o.id AND o.id=$1 AND t.status='VALID' AND t.emailed_at IS NULL
       AND EXISTS (SELECT 1 FROM payments p WHERE p.hold_id=o.hold_id AND p.status='PAID')
     RETURNING t.id`, [orderId],
  );
  let sent = 0, failed = 0;
  for (const claimedTicket of claimed.rows) {
    try {
      const result = await pool.query<{
        id: string; event_id: string; ticket_type_name: string; status: string;
        recipient: string; buyer_name: string; buyer_email: string; event_title: string;
        city: string; venue: string; date_iso: Date;
      }>(
        `SELECT t.id, t.event_id, t.ticket_type_name, t.status, ${TICKET_OWNER_SQL} AS recipient,
                o.buyer_name, o.buyer_email, o.event_title, e.city, e.venue, e.date_iso
         FROM tickets t JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=t.event_id
         WHERE t.id=$1 AND o.id=$2 AND t.status='VALID' AND t.emailed_to=${TICKET_OWNER_SQL}
           AND EXISTS (SELECT 1 FROM payments p WHERE p.hold_id=o.hold_id AND p.status='PAID')`,
        [claimedTicket.id, orderId],
      );
      const ticket = result.rows[0];
      if (!ticket || !ticket.recipient?.includes("@")) throw new Error("Delivery no longer authorized");
      const png = await renderTicketQr(ticket);
      await sendTicketEmail({
        to: [ticket.recipient],
        ticket: { id: ticket.id, status: ticket.status, ticketTypeName: ticket.ticket_type_name, qrPngBase64: png.toString("base64") },
        order: { id: orderId, buyerName: ticket.buyer_name, buyerEmail: ticket.buyer_email, ownerEmail: ticket.recipient },
        event: { id: ticket.event_id, title: ticket.event_title, city: ticket.city, venue: ticket.venue, dateISO: new Date(ticket.date_iso).toISOString() },
      });
      sent++;
    } catch {
      failed++;
      await pool.query(`UPDATE tickets SET emailed_at=NULL, emailed_to=NULL WHERE id=$1 AND order_id=$2`, [claimedTicket.id, orderId]);
    }
  }
  return { attempted: true, sent, failed };
}
