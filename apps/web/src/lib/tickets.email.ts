// apps/web/src/lib/tickets.email.ts
import { sendTransactionalMail, type Mail } from '@/lib/mail/transport.server';

type TicketEmailItem = {
  id: string;
  status: string;
  ticketTypeName: string;
  // ✅ opcional: PNG del QR en base64 (sin data: prefix)
  qrPngBase64?: string | null;
};

type SendTicketEmailArgs = {
  to: string[]; // soporta múltiples
  // ✅ backwards compatible: antes enviabas "ticket", ahora también puede venir "tickets"
  ticket?: TicketEmailItem;
  tickets?: TicketEmailItem[];

  order: {
    id: string;
    buyerName: string;
    buyerEmail: string;
    ownerEmail: string;
  };
  event: {
    id: string;
    title: string;
    city: string;
    venue: string;
    dateISO: string;
  };
};

function esc(s: unknown) {
  return String(s ?? "").replace(/[<>&"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

function cidForTicket(ticketId: string) {
  // contentId debe ser <128 chars, y mejor sin cosas raras
  const safe = String(ticketId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .slice(0, 110);

  return `qr-${safe}`;
}

export function buildTicketEmail(args: SendTicketEmailArgs): Mail {
  const from = process.env.FROM_EMAIL || '';
  const subject = `Tus entradas — ${args.event.title || "TicketChile"}`;

  const tickets: TicketEmailItem[] = Array.isArray(args.tickets)
    ? args.tickets
    : args.ticket
    ? [args.ticket]
    : [];

  if (tickets.length === 0) {
    throw new Error("sendTicketEmail: no se recibió ticket(s).");
  }

  // ✅ Adjuntos inline (CID) para los que traen qrPngBase64
  // Resend: attachments + contentId (Node SDK) :contentReference[oaicite:1]{index=1}
  const attachments = tickets
    .filter((t) => !!t.qrPngBase64)
    .map((t) => {
      const contentId = cidForTicket(t.id);
      return {
        filename: `${contentId}.png`,
        content: String(t.qrPngBase64),
        contentType: "image/png",
        contentId, // 👈 Node SDK usa contentId
      };
    });

  const htmlTickets = tickets
    .map((t) => {
      const cid = cidForTicket(t.id);
      const hasQr = !!t.qrPngBase64;

      return `
        <div style="border:1px solid #eee;border-radius:12px;padding:12px;margin:12px 0">
          <p style="margin:0 0 8px"><b>Ticket:</b> ${esc(t.id)}</p>
          <p style="margin:0 0 8px"><b>Tipo:</b> ${esc(t.ticketTypeName)}</p>
          <p style="margin:0 0 8px"><b>Estado:</b> ${esc(t.status)}</p>

          ${
            hasQr
              ? `
                <div style="margin-top:10px">
                  <p style="margin:0 0 8px"><b>QR:</b></p>
                  <img
                    src="cid:${cid}"
                    alt="QR Ticket"
                    width="220"
                    height="220"
                    style="display:block;border:1px solid #ddd;border-radius:12px"
                  />
                  <p style="margin:10px 0 0;color:#666;font-size:12px">
                    Presenta este QR en la entrada.
                  </p>
                </div>
              `
              : `
                <p style="margin:10px 0 0;color:#b00;font-size:12px">
                  No se pudo adjuntar el QR (pero el ticket sigue siendo válido).
                </p>
              `
          }
        </div>
      `;
    })
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.4">
      <h2 style="margin:0 0 12px">Tus entradas</h2>

      <p style="margin:0 0 8px"><b>Evento:</b> ${esc(args.event.title)}</p>
      <p style="margin:0 0 8px"><b>Comprador:</b> ${esc(args.order.buyerEmail)}</p>
      <p style="margin:0 0 8px"><b>Lugar:</b> ${esc(args.event.venue)} — ${esc(args.event.city)}</p>
      <p style="margin:0 0 16px"><b>Fecha:</b> ${esc(args.event.dateISO)}</p>

      <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>

      ${htmlTickets}

      <p style="margin:16px 0 0;color:#666;font-size:12px">
        Si no reconoces esta compra, ignora este correo.
      </p>
    </div>
  `;

  return {
    from,
    to: args.to,
    subject,
    html,
    // ✅ inline images via attachments
    attachments: attachments.length ? attachments : undefined,
  };
}

export async function sendTicketEmail(args: SendTicketEmailArgs, key: string) {
  return sendTransactionalMail(buildTicketEmail(args), key);
}
