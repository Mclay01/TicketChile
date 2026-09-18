import "server-only";
import * as QRCode from "qrcode";
import { signTicketToken } from "@/lib/qr-token.server";

/** Internal only: callers must resolve a persisted ticket under an access guard
 * or a verified paid-order delivery query before calling this renderer. */
export async function renderTicketQr(ticket: { id: string; event_id: string }) {
  const token = signTicketToken({ ticketId: ticket.id, eventId: ticket.event_id });
  return QRCode.toBuffer(token, { type: "png", width: 260, margin: 1, errorCorrectionLevel: "M" });
}
