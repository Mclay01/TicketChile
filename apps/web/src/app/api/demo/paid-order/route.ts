// apps/web/src/app/api/demo/paid-order/route.ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe.server";
import { preparePaymentForHoldPg, consumeHoldToPaidOrderPg } from "@/lib/checkout.pg.server";

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

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Body inválido (JSON)." });
  }

  const holdId = pickString(body?.holdId);
  const eventTitle = pickString(body?.eventTitle);
  const buyerName = pickString(body?.buyerName);
  const buyerEmail = pickString(body?.buyerEmail);

  if (!holdId) return json(400, { ok: false, error: "Falta holdId." });
  if (!eventTitle) return json(400, { ok: false, error: "Falta eventTitle." });
  if (buyerName.length < 2) return json(400, { ok: false, error: "buyerName inválido." });
  if (!buyerEmail.includes("@")) return json(400, { ok: false, error: "buyerEmail inválido." });

  // Si Stripe no está configurado -> modo demo (como estabas antes)
  const stripeEnabled = Boolean(process.env.STRIPE_SECRET_KEY);
  if (!stripeEnabled) {
    try {
      const { order, tickets } = await consumeHoldToPaidOrderPg({
        holdId,
        eventTitle,
        buyerName,
        buyerEmail,
      });
      return json(200, { ok: true, order, tickets, mode: "demo" });
    } catch (e: any) {
      return json(409, { ok: false, error: String(e?.message || e) });
    }
  }

  try {
    // 1) “1 pago por hold”: crea/reusa payments (UNIQUE hold_id)
    const prep = await preparePaymentForHoldPg({
      holdId,
      provider: "stripe",
    });

    if (!prep.payment?.id) {
      // si por alguna razón no pudo crear payment, cae a demo
      const { order, tickets } = await consumeHoldToPaidOrderPg({
        holdId,
        eventTitle,
        buyerName,
        buyerEmail,
      });
      return json(200, { ok: true, order, tickets, mode: "demo-fallback" });
    }

    const origin = new URL(req.url).origin;

    // 2) Crear Checkout Session (CLP es 0-decimal)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: buyerEmail,
      line_items: [
        {
          price_data: {
            currency: "clp",
            product_data: { name: `Entrada: ${eventTitle}` },
            unit_amount: prep.amountCLP, // CLP
          },
          quantity: 1,
        },
      ],
      metadata: {
        holdId,
        paymentId: prep.payment.id,
        buyerName,
        buyerEmail,
        eventTitle,
      },
      success_url: `${origin}/checkout/${encodeURIComponent(prep.eventId)}?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/${encodeURIComponent(prep.eventId)}?canceled=1`,
    });

    if (!session.url) {
      throw new Error("Stripe no devolvió session.url (revisa configuración).");
    }

    // OJO: acá NO emitimos tickets. Eso lo hace el webhook.
    return json(200, {
      ok: true,
      redirectUrl: session.url,
      paymentId: prep.payment.id,
      amountCLP: prep.amountCLP,
      mode: "stripe",
    });
  } catch (e: any) {
    return json(409, { ok: false, error: String(e?.message || e) });
  }
}
