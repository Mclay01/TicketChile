// apps/web/src/lib/tickets.email.ts
import { Resend } from "resend";

type SendTicketEmailArgs = {
  to: string[]; // puede ser 1 o varios
  ticket: {
    id: string;
    status: string;
    ticketTypeName: string;
  };
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

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta env ${name}`);
  return v;
}

function esc(s: any) {
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

function normalizeEmail(v: any) {
  return String(v || "").trim().toLowerCase();
}

export async function sendTicketEmail(args: SendTicketEmailArgs) {
  const apiKey = mustEnv("RESEND_API_KEY");

  // ✅ si no tienes dominio verificado, esto FUNCIONA siempre en Resend (modo dev)
  // Si ya tienes un sender verificado, setea FROM_EMAIL en Vercel y listo.
  const fromEnv = String(process.env.FROM_EMAIL || "").trim();
  const from = fromEnv || "TicketChile <onboarding@resend.dev>";

  const resend = new Resend(apiKey);

  const to = (Array.isArray(args.to) ? args.to : [])
    .map(normalizeEmail)
    .filter((x) => x.includes("@"));

  if (to.length === 0) {
    throw new Error("sendTicketEmail: no hay destinatarios válidos en args.to");
  }

  const subject = `Tus entradas — ${args.event.title || "TicketChile"}`;

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.4">
    <h2 style="margin:0 0 12px">Tus entradas</h2>

    <p style="margin:0 0 8px"><b>Evento:</b> ${esc(args.event.title)}</p>
    <p style="margin:0 0 8px"><b>Comprador:</b> ${esc(args.order.buyerEmail)}</p>
    <p style="margin:0 0 8px"><b>Lugar:</b> ${esc(args.event.venue)} — ${esc(args.event.city)}</p>
    <p style="margin:0 0 16px"><b>Fecha:</b> ${esc(args.event.dateISO)}</p>

    <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>

    <p style="margin:0 0 8px"><b>Ticket:</b> ${esc(args.ticket.id)}</p>
    <p style="margin:0 0 8px"><b>Tipo:</b> ${esc(args.ticket.ticketTypeName)}</p>
    <p style="margin:0 0 8px"><b>Estado:</b> ${esc(args.ticket.status)}</p>

    <p style="margin:16px 0 0;color:#666;font-size:12px">
      Si no reconoces esta compra, ignora este correo.
    </p>
  </div>
  `;

  // ✅ Resend devuelve { data, error } (a veces NO lanza excepción).
  const out: any = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });

  // ✅ CLAVE: si hay error, lo levantamos para que /api/tickets/resend lo muestre en failedTo
  if (out?.error) {
    const msg =
      typeof out.error === "string"
        ? out.error
        : out.error?.message
        ? String(out.error.message)
        : JSON.stringify(out.error);

    throw new Error(`Resend error: ${msg}`);
  }

  return out;
}
