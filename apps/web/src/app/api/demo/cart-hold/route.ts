import { NextResponse } from "next/server";
import { EVENTS } from "@/lib/events";
import {
  getSoldQtyForTicketType,
  getActiveHoldQtyForTicketTypeExcludingHold,
  getHoldServer,
  getQtyForTicketTypeInHoldServer,
  upsertHoldServer,
} from "@/lib/demo-db.server";

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
function pickCapacity(tt: any) {
  const n = Number(tt?.capacity ?? tt?.stock ?? tt?.qty ?? tt?.maxQty ?? 0);
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
  const holdId = pickString(body?.holdId);
  const ttlSeconds = pickNumber(body?.ttlSeconds) || 8 * 60;

  if (!eventId) return json(400, { ok: false, error: "Falta eventId." });

  const ev = EVENTS.find((e) => e.id === eventId);
  if (!ev) return json(404, { ok: false, error: "Evento no existe." });

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const items = rawItems
    .map((it: any) => {
      const ticketTypeId =
        pickString(it?.ticketTypeId) || pickString(it?.id) || pickString(it?.typeId);

      const ticketTypeName =
        pickString(it?.ticketTypeName) || pickString(it?.name) || pickString(it?.typeName);

      const unitPriceCLP =
        pickNumber(it?.unitPriceCLP) || pickNumber(it?.priceCLP) || pickNumber(it?.price);

      const qty = pickNumber(it?.qty) || pickNumber(it?.quantity);

      return { ticketTypeId, ticketTypeName, unitPriceCLP, qty };
    })
    .filter((it: any) => it.ticketTypeId && it.ticketTypeName && it.qty > 0 && it.unitPriceCLP > 0);

  // Si no hay items, liberamos el hold si existe
  if (items.length === 0) {
    if (holdId) {
      // opcional: podrías llamar releaseHoldServer aquí; yo prefiero endpoint dedicado
    }
    return json(200, { ok: true, hold: null });
  }

  // Validar que el hold sea del mismo evento si viene
  if (holdId) {
    const h = getHoldServer(holdId);
    if (h && h.eventId !== eventId) {
      return json(400, { ok: false, error: "holdId no pertenece a este evento." });
    }
  }

  // Validar stock real por tipo, EXCLUYENDO el hold actual (si existe)
  for (const it of items) {
    const tt = (ev.ticketTypes as any[]).find((x) => x.id === it.ticketTypeId);
    if (!tt) return json(400, { ok: false, error: `TicketType inválido: ${it.ticketTypeId}` });

    const capacity = pickCapacity(tt);
    const sold = getSoldQtyForTicketType(eventId, it.ticketTypeId, it.ticketTypeName);

    const heldOthers = getActiveHoldQtyForTicketTypeExcludingHold(eventId, it.ticketTypeId, holdId || undefined);

    // El usuario puede “reusar” su hold: su propio qty ya está reservado.
    const alreadyInThisHold = holdId ? getQtyForTicketTypeInHoldServer(holdId, it.ticketTypeId) : 0;

    const remainingForNew = Math.max(capacity - sold - heldOthers, 0);

    // Permitimos hasta remaining + lo que ya reservaste tú mismo
    if (it.qty > remainingForNew + alreadyInThisHold) {
      const maxAllowed = remainingForNew + alreadyInThisHold;
      return json(409, {
        ok: false,
        error: `Stock insuficiente para "${it.ticketTypeName}". Máximo ahora: ${maxAllowed}.`,
      });
    }
  }

  const { hold, reused } = upsertHoldServer({
    holdId: holdId || undefined,
    eventId,
    items,
    ttlSeconds,
  });

  return json(200, { ok: true, hold, reused });
}
