// apps/web/src/app/api/demo/hold/route.ts
import { NextResponse } from "next/server";
import { createHoldPgServer } from "@/lib/hold.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function pickNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Body inválido (JSON)." });
  }

  const eventId = pickString(body?.eventId);

  // Opción B: el hold lo haces “al final”, así que el TTL puede ser corto.
  // Igual dejamos fallback a 8 min por compatibilidad.
  const ttlSeconds = pickNumber(body?.ttlSeconds) || 8 * 60;

  if (!eventId) return json(400, { ok: false, error: "Falta eventId." });

  const rawItems = Array.isArray(body?.items) ? body.items : [];

  // Solo aceptamos ticketTypeId + qty desde cliente (canon sale de la DB)
  const requested = rawItems
    .map((it: any) => {
      const ticketTypeId =
        pickString(it?.ticketTypeId) || pickString(it?.id) || pickString(it?.typeId);
      const qty = Math.floor(pickNumber(it?.qty) || pickNumber(it?.quantity));
      return { ticketTypeId, qty };
    })
    .filter((it: any) => it.ticketTypeId && it.qty > 0);

  if (requested.length === 0) {
    return json(400, { ok: false, error: "No hay items válidos (qty>0)." });
  }

  try {
    const { hold } = await createHoldPgServer({ eventId, requested, ttlSeconds });
    return json(200, { ok: true, hold });
  } catch (e: any) {
    const msg = String(e?.message || e);
    const status =
      msg.includes("Stock insuficiente") ? 409 :
      msg.includes("Evento no existe") ? 404 :
      msg.includes("TicketType inválido") ? 400 :
      409;

    return json(status, { ok: false, error: msg });
  }
}
