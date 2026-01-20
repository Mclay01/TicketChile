// apps/web/src/app/api/tickets/resend/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { Resend } from "resend";
import { signTicketToken } from "@/lib/qr-token.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function esc(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Base URL “real” para links en emails.
 * - En prod: pon APP_BASE_URL=https://www.ticketchile.com en Vercel.
 * - En local: APP_BASE_URL puede ser http://localhost:3001 (pero OJO: en emails no sirve).
 */
function getBaseUrl(req: Request) {
  const envBase = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (envBase) return envBase.replace(/\/+$/g, "");

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3001";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
    if (!RESEND_API_KEY) return json(500, { ok: false, error: "Falta RESEND_API_KEY." });

    const from = (process.env.EMAIL_FROM || "").trim();
    if (!from) return json(500, { ok: false, error: "Falta EMAIL_FROM (ej: 'Ticket Chile <tickets@ticketchile.com>')." });

    const body = await req.json().catch(() => null);
    const orderId = String(body?.orderId ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!orderId) return json(400, { ok: false, error: "Falta orderId." });
    if (!email || !isEmail(email)) return json(400, { ok: false, error: "Email inválido." });

    // 1) Order + Event info
    const oRes = await pool.query(
      `
      SELECT
        o.id, o.event_id, o.event_title, o.buyer_name, o.buyer_email,
        e.slug, e.city, e.venue, e.date_iso
      FROM orders o
      JOIN events e ON e.id = o.event_id
      WHERE o.id = $1
      LIMIT 1
      `,
      [orderId]
    );

    if (oRes.rowCount === 0) return json(404, { ok: false, error: "Order no encontrada." });

    const order = oRes.rows[0];
    const buyerEmail = String(order.buyer_email || "").toLowerCase();

    // Seguridad mínima: no reenviar a correos random
    if (buyerEmail && buyerEmail !== email) {
      return json(403, { ok: false, error: "Ese pedido pertenece a otro correo." });
    }

    // 2) Tickets
    const tRes = await pool.query(
      `
      SELECT id, ticket_type_name, status, created_at
      FROM tickets
      WHERE order_id = $1
      ORDER BY created_at ASC
      `,
      [orderId]
    );

    if (tRes.rowCount === 0) return json(404, { ok: false, error: "No hay tickets para esa order todavía." });

    const base = getBaseUrl(req);
    const manageUrl = `${base}/mis-tickets?email=${encodeURIComponent(email)}`;

    const ticketsHtml = tRes.rows
      .map((t: any) => {
        const ticketId = String(t.id);
        const typeName = String(t.ticket_type_name || "");
        const token = signTicketToken({ ticketId, eventId: String(order.event_id) });

        // QR público (cuando despliegues, esto será accesible)
        const qrUrl = `${base}/api/qr?t=${encodeURIComponent(token)}`;

        // Link para Google Wallet (opcional; si no está configurado, tu endpoint puede responder 501)
        const walletUrl = `${base}/wallet/google/save-url?t=${encodeURIComponent(token)}`;

        return `
          <div style="border:1px solid #eee;border-radius:12px;padding:14px;margin:12px 0">
            <div style="font-size:14px;color:#111"><b>${esc(typeName)}</b></div>
            <div style="font-size:12px;color:#555">TicketId: ${esc(ticketId)}</div>

            <div style="margin-top:10px">
              <img src="${qrUrl}" alt="Código QR" width="220" height="220"
                   style="display:block;border-radius:12px;border:1px solid #eee"/>
            </div>

            <div style="margin-top:12px">
              <a href="${walletUrl}"
                 style="display:inline-block;padding:10px 12px;border-radius:10px;
                        border:1px solid #111;text-decoration:none;color:#111;font-size:14px">
                 Agregar a Google Wallet
              </a>
            </div>
          </div>
        `;
      })
      .join("");

    const subject = `Tus entradas — ${String(order.event_title || "Evento")}`;

    const html = `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.45;color:#111">
        <h2 style="margin:0 0 6px 0">Tus entradas</h2>
        <div style="color:#555;font-size:14px;margin-bottom:14px">
          Evento: <b>${esc(String(order.event_title || ""))}</b><br/>
          Comprador: ${esc(email)}<br/>
          Lugar: ${esc(String(order.venue || ""))} — ${esc(String(order.city || ""))}
        </div>

        ${ticketsHtml}

        <div style="margin-top:16px;font-size:14px">
          Si tu correo no muestra imágenes (sí, Gmail a veces se pone creativo), abre tu página de tickets:
          <a href="${manageUrl}">${manageUrl}</a>
        </div>
      </div>
    `;

    const resend = new Resend(RESEND_API_KEY);
    await resend.emails.send({
      from,
      to: email,
      subject,
      html,
    });

    return json(200, { ok: true });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}
