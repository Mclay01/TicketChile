import { NextResponse } from "next/server";
import crypto from "crypto";
import { flowPost, getFlowConfig } from "../_lib/flow";

// (Opcional) para bajar latencia en Sudamérica
export const runtime = "nodejs";
export const preferredRegion = ["gru1"];

type CreateReq = {
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  payerEmail: string;
  payerRut?: string;
};

type FlowCreateResponse = {
  url: string;
  token: string;
  flowOrder: number;
}; // :contentReference[oaicite:3]{index=3}

export async function POST(req: Request) {
  try {
    const { apiKey } = getFlowConfig();
    const body = (await req.json()) as CreateReq;

    // Validaciones mínimas (no confíes en el cliente)
    const eventId = String(body.eventId || "").trim();
    const ticketTypeId = String(body.ticketTypeId || "").trim();
    const quantity = Number(body.quantity || 0);
    const payerEmail = String(body.payerEmail || "").trim();

    if (!eventId || !ticketTypeId || !payerEmail || !Number.isFinite(quantity) || quantity < 1) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos para crear pago Flow" },
        { status: 400 }
      );
    }

    // ✅ Importante: calcula el monto en el server.
    // Acá debes calcular el precio real según tu evento/ticketTypeId.
    // Ejemplo (AJUSTA a tu proyecto): buscar el evento y el ticket type.
    // const event = await getEventById(eventId);
    // const tt = event.ticketTypes.find(t => t.id === ticketTypeId);
    // const amount = tt.price * quantity;

    // Por ahora, te dejo un placeholder que OBLIGA a que lo implementes:
    const amount = await resolveAmountFromYourDB(eventId, ticketTypeId, quantity);

    const commerceOrder = `tc_${eventId}_${crypto.randomUUID()}`;
    const subject = `TicketChile - ${eventId} (${quantity} ticket(s))`;

    const appUrl = process.env.APP_URL!;
    const urlConfirmation = `${appUrl}/api/payments/flow/confirm`;
    const urlReturn = `${appUrl}/checkout/flow/return?eventId=${encodeURIComponent(eventId)}&order=${encodeURIComponent(commerceOrder)}`;

    // optional se manda como JSON string :contentReference[oaicite:4]{index=4}
    const optional = JSON.stringify({
      eventId,
      ticketTypeId,
      quantity,
      rut: body.payerRut || null,
    });

    // payment/create: crea link de pago :contentReference[oaicite:5]{index=5}
    // Parámetros típicos: apiKey, commerceOrder, subject, amount, email, urlConfirmation, urlReturn, optional, timeout :contentReference[oaicite:6]{index=6}
    const flowResp = await flowPost<FlowCreateResponse>("/payment/create", {
      apiKey,
      commerceOrder,
      subject,
      amount: String(amount),
      email: payerEmail,
      urlConfirmation,
      urlReturn,
      optional,
      timeout: "600", // 10 min
    });

    const redirectUrl = `${flowResp.url}?token=${flowResp.token}`; // :contentReference[oaicite:7]{index=7}

    // TIP: acá idealmente guardas una orden "PENDING" en tu DB con commerceOrder/flowOrder/token.
    // await savePendingOrder({ commerceOrder, flowOrder: flowResp.flowOrder, amount, eventId, ticketTypeId, quantity, payerEmail });

    return NextResponse.json({ ok: true, redirectUrl, commerceOrder });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Error creando pago Flow" },
      { status: 500 }
    );
  }
}

/**
 * ⚠️ IMPLEMENTA ESTO con tu DB real (Prisma / SQL / lo que uses).
 * La gracia es: NUNCA aceptar amount del cliente.
 */
async function resolveAmountFromYourDB(eventId: string, ticketTypeId: string, quantity: number) {
  // TODO: reemplazar por tu lógica real.
  // Lanza error para que no se te vaya a producción con un monto inventado.
  throw new Error(
    `Implementa resolveAmountFromYourDB(eventId=${eventId}, ticketTypeId=${ticketTypeId}, quantity=${quantity})`
  );
}
