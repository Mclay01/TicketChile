// apps/web/src/app/api/tickets/resend/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { sendTicketEmail } from "@/lib/tickets.email";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { apiUrl } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeEmail(v: any) {
  return String(v || "").trim().toLowerCase();
}

function uniqEmails(emails: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const e of emails) {
    const n = normalizeEmail(e);
    if (n.includes("@")) set.add(n);
  }
  return Array.from(set);
}

function normalizeBaseUrl(u: string) {
  return String(u || "").replace(/\/+$/, "");
}

// ✅ Base URL robusta para server->server fetch en Vercel
function baseUrlFromRequest(req: Request) {
  const envBase = normalizeBaseUrl(
    String(process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "").trim()
  );
  if (envBase) return envBase;

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (!host) return "";
  return normalizeBaseUrl(`${proto}://${host}`);
}

async function fetchQrPngBase64(req: Request, ticketId: string, eventId: string) {
  try {
    const base = baseUrlFromRequest(req);
    if (!base) return null;

    // Usa tu prefijo actual (api/demo o api, etc.)
    const path = apiUrl(
      `/qr?ticketId=${encodeURIComponent(ticketId)}&eventId=${encodeURIComponent(eventId)}`
    );
    const url = `${base}${path}`;

    // Por si tu /qr requiere cookies de sesión (más robusto)
    const cookie = req.headers.get("cookie") || "";

    const r = await fetch(url, {
      method: "GET",
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });

    if (!r.ok) return null;

    const ab = await r.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");
    return b64 || null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Body inválido (JSON)." });
  }

  const ticketId = String(body?.ticketId || "").trim();
  if (!ticketId) return json(400, { ok: false, error: "Falta ticketId." });

  // ✅ email de la cuenta logueada (fallback)
  const session = await getServerSession(authOptions);
  const sessionEmail = normalizeEmail(session?.user?.email);

  const client = await pool.connect();
  try {
    const tRes = await client.query(
      `
      SELECT
        t.id as ticket_id,
        t.status as ticket_status,
        t.ticket_type_name,
        t.owner_email as ticket_owner_email,
        o.id as order_id,
        o.buyer_name,
        o.buyer_email,
        o.owner_email as order_owner_email,
        o.event_id,
        o.event_title,
        e.city,
        e.venue,
        e.date_iso
      FROM tickets t
      JOIN orders o ON o.id = t.order_id
      LEFT JOIN events e ON e.id = o.event_id
      WHERE t.id = $1
      LIMIT 1
      `,
      [ticketId]
    );

    if (tRes.rowCount === 0) {
      return json(404, { ok: false, error: "Ticket no encontrado." });
    }

    const row = tRes.rows[0];

    const buyerEmail = normalizeEmail(row.buyer_email);
    const ownerEmailFromTicket = normalizeEmail(row.ticket_owner_email);
    const ownerEmailFromOrder = normalizeEmail(row.order_owner_email);

    // ✅ destinatarios: checkout + owner(ticket/order) + sesión(fallback)
    const to = uniqEmails([buyerEmail, ownerEmailFromTicket, ownerEmailFromOrder, sessionEmail]);

    if (to.length === 0) {
      return json(409, { ok: false, error: "No hay destinatarios válidos para reenviar." });
    }

    // ✅ Traer QR en base64 una sola vez
    const eventId = String(row.event_id || "").trim();
    const qrPngBase64 = eventId ? await fetchQrPngBase64(req, String(row.ticket_id), eventId) : null;

    const sentTo: string[] = [];
    const failedTo: Array<{ email: string; error: string }> = [];

    for (const email of to) {
      try {
        await sendTicketEmail({
          to: [email],
          ticket: {
            id: String(row.ticket_id),
            status: String(row.ticket_status),
            ticketTypeName: String(row.ticket_type_name || ""),
            qrPngBase64, // ✅ aquí va el QR
          },
          order: {
            id: String(row.order_id),
            buyerName: String(row.buyer_name || ""),
            buyerEmail,
            ownerEmail: ownerEmailFromTicket || ownerEmailFromOrder || sessionEmail || "",
          },
          event: {
            id: eventId,
            title: String(row.event_title || ""),
            city: String(row.city || ""),
            venue: String(row.venue || ""),
            dateISO: row.date_iso ? new Date(row.date_iso).toISOString() : "",
          },
        });

        sentTo.push(email);
      } catch (e: any) {
        failedTo.push({ email, error: String(e?.message || e) });
      }
    }

    if (sentTo.length > 0) {
      return json(200, {
        ok: true,
        sentTo,
        failedTo,
        qrIncluded: Boolean(qrPngBase64),
      });
    }

    return json(500, {
      ok: false,
      error: "Falló el envío a todos los destinatarios.",
      failedTo,
    });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message || e) });
  } finally {
    client.release();
  }
}
