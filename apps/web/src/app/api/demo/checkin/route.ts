// apps/web/src/app/api/demo/checkin/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyTicketToken } from "@/lib/qr-token.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

// Si el QR viene URL-encoded (ticketId%3D...), lo normalizamos.
function normalizeQrText(input: string) {
  let s = (input ?? "").trim();
  try {
    if (/%[0-9A-Fa-f]{2}/.test(s)) s = decodeURIComponent(s);
  } catch {}
  return s;
}

function parseQrText(qrTextRaw: string) {
  const qrText = normalizeQrText(qrTextRaw);

  // 0) Token firmado: tc1.<ticketId>.<eventId>.<iatMs>.<sig>
  if (qrText.startsWith("tc1.")) {
    const v = verifyTicketToken(qrText);
    if (!v) {
      return { ticketId: "", eventId: "", tokenInvalid: true as const };
    }
    return { ticketId: v.ticketId, eventId: v.eventId, tokenInvalid: false as const };
  }

  // 1) JSON: {"ticketId":"...","eventId":"..."} (o snake_case)
  try {
    if (qrText.startsWith("{")) {
      const j = JSON.parse(qrText);
      const ticketId = pickString(j.ticketId || j.ticket_id || j.id);
      const eventId = pickString(j.eventId || j.event_id);
      if (ticketId) return { ticketId, eventId, tokenInvalid: false as const };
    }
  } catch {}

  // 2) URL completa o querystring: ...?ticketId=...&eventId=...
  try {
    const qs = qrText.includes("?") ? qrText.split("?")[1] : qrText;
    const decodedQs = normalizeQrText(qs);

    if (
      decodedQs.includes("ticketId=") ||
      decodedQs.includes("ticketid=") ||
      decodedQs.includes("ticket_id=") ||
      decodedQs.includes("eventId=") ||
      decodedQs.includes("eventid=") ||
      decodedQs.includes("event_id=")
    ) {
      const sp = new URLSearchParams(decodedQs);
      const ticketId =
        pickString(sp.get("ticketId")) ||
        pickString(sp.get("ticketid")) ||
        pickString(sp.get("ticket_id")) ||
        pickString(sp.get("id")) ||
        pickString(sp.get("ticket"));
      const eventId =
        pickString(sp.get("eventId")) ||
        pickString(sp.get("eventid")) ||
        pickString(sp.get("event_id"));
      if (ticketId) return { ticketId, eventId, tokenInvalid: false as const };
    }
  } catch {}

  // 3) Fallback: cazar tix_... y evt_...
  const tid = qrText.match(/tix_[a-z0-9]+/i)?.[0] ?? "";
  const eid = qrText.match(/evt_[a-z0-9]+/i)?.[0] ?? "";
  if (tid) return { ticketId: tid, eventId: eid, tokenInvalid: false as const };

  // 4) Último fallback: si el QR es “solo el id”
  return { ticketId: qrText.trim(), eventId: "", tokenInvalid: false as const };
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Body inválido (JSON)." });
  }

  const eventId = pickString(body?.eventId);
  const qrText = pickString(body?.qrText);
  const manualTicketId = pickString(body?.ticketId);

  if (!eventId) return json(400, { ok: false, error: "Falta eventId." });

  // Parsear solo si viene qrText. Si viene ticketId manual, lo usamos directo.
  const parsed = qrText ? parseQrText(qrText) : { ticketId: "", eventId: "", tokenInvalid: false as const };

  // Si era token tc1 pero firma mala → afuera
  if (qrText && parsed.tokenInvalid) {
    return json(409, { ok: false, error: "QR inválido (firma no válida)." });
  }

  const ticketId = manualTicketId || parsed.ticketId;

  if (!ticketId) {
    return json(400, { ok: false, error: "Falta ticketId/qrText." });
  }

  // Seguridad: si dentro del QR viene eventId, debe coincidir
  if (parsed.eventId && parsed.eventId !== eventId) {
    return json(409, { ok: false, error: "QR no corresponde a este evento." });
  }

  // DEBUG útil
  console.log("[checkin] incoming", {
    eventId,
    ticketId,
    parsedEventId: parsed.eventId,
    qrTextPreview: qrText?.slice(0, 120),
  });

  // Marcar usado (atómico)
  const upd = await pool.query(
    `
    UPDATE tickets
    SET status='USED', used_at=NOW()
    WHERE id=$1 AND event_id=$2 AND status='VALID'
    RETURNING id, ticket_type_name, buyer_email, status, used_at
    `,
    [ticketId, eventId]
  );

  if (upd.rowCount === 1) {
    const t = upd.rows[0];
    return json(200, {
      ok: true,
      ticket: {
        id: t.id,
        ticketTypeName: t.ticket_type_name,
        buyerEmail: t.buyer_email,
        status: t.status,
        usedAtISO: new Date(t.used_at).toISOString(),
      },
    });
  }

  // Si no se pudo actualizar, vemos por qué
  const r = await pool.query(
    `SELECT id, status, used_at FROM tickets WHERE id=$1 AND event_id=$2`,
    [ticketId, eventId]
  );

  if (r.rowCount === 0) {
    return json(404, { ok: false, error: "Ticket no existe.", debug: { ticketId, eventId } });
  }

  const row = r.rows[0];
  if (row.status === "USED") {
    return json(409, {
      ok: false,
      error: "Ticket ya fue usado.",
      usedAtISO: row.used_at ? new Date(row.used_at).toISOString() : null,
    });
  }

  return json(409, { ok: false, error: "No se pudo validar el ticket." });
}
