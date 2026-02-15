import { NextResponse } from "next/server";
import { getEventById } from "@/lib/events";

export const dynamic = "force-dynamic";

type Body = {
  eventId?: string;
  items?: Array<{ ticketTypeId: string; qty: number }>;
  amount?: number;
  currency?: string;

  // metadata + buyer (los dejo porque quizá tu front aún los manda)
  metadata?: any;

  buyerName?: string;
  buyerEmail?: string;
  buyerRut?: string;
  buyerPhone?: string;
  buyerRegion?: string;
  buyerComuna?: string;
  buyerAddress1?: string;
  buyerAddress2?: string;
};

function jsonError(message: string, status = 400, extra?: any) {
  return NextResponse.json(
    { error: { message, ...(extra ? { extra } : {}) } },
    { status }
  );
}

export async function POST(req: Request) {
  // ✅ Aunque Fintoc ya no se use, mantenemos la ruta compilable y explícita.
  // Si quieres reactivarlo después, aquí mismo lo conectas.

  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("Body inválido (se esperaba JSON).", 400);
  }

  const eventId = String(body?.eventId || "").trim();
  if (!eventId) return jsonError("Falta eventId.", 400);

  // ✅ FIX: getEventById es async => await
  const event = await getEventById(eventId);
  if (!event) return jsonError("Evento no encontrado.", 404);

  const items = Array.isArray(body?.items) ? body!.items! : [];
  if (!items.length) return jsonError("Faltan items.", 400);

  // ✅ Este era el punto que te quebraba: event.ticketTypes ahora existe porque event ya está resuelto.
  const byId = new Map(event.ticketTypes.map((t) => [t.id, t]));

  let total = 0;
  for (const it of items) {
    const ticketTypeId = String(it?.ticketTypeId || "").trim();
    const qty = Math.floor(Number(it?.qty || 0));
    if (!ticketTypeId || !Number.isFinite(qty) || qty <= 0) continue;

    const tt = byId.get(ticketTypeId);
    if (!tt) {
      return jsonError(`Tipo de ticket inválido: ${ticketTypeId}`, 400);
    }

    total += Number(tt.priceCLP) * qty;
  }

  if (!Number.isFinite(total) || total <= 0) {
    return jsonError("Total inválido.", 400);
  }

  /**
   * ✅ DESHABILITADO A PROPÓSITO
   * Tú ya moviste el checkout a Webpay/Flow.
   * Esto evita que el build falle y deja un mensaje claro si alguien pega a esta ruta.
   */
  return NextResponse.json(
    {
      status: "DISABLED",
      message:
        "Fintoc está deshabilitado en producción. Usa /api/payments/webpay/create o /api/payments/flow/create.",
      debug: {
        eventId,
        computedTotal: total,
      },
    },
    { status: 410 } // Gone
  );
}
