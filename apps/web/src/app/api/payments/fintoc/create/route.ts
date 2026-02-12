import { NextRequest, NextResponse } from "next/server";
import { getEventById } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Item = { ticketTypeId: string; qty: number };

function pickString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function getOrigin(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    req.headers.get("origin") ||
    "http://localhost:3000"
  );
}

function parseItems(input: unknown): Item[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x: any) => ({
      ticketTypeId: pickString(x?.ticketTypeId),
      qty: Number(x?.qty),
    }))
    .filter((x) => x.ticketTypeId && Number.isFinite(x.qty) && x.qty > 0)
    .map((x) => ({ ticketTypeId: x.ticketTypeId, qty: Math.floor(x.qty) }));
}

function computeAmountFromEvent(eventId: string, items: Item[]): number | null {
  const event = getEventById(eventId);
  if (!event) return null;

  const byId = new Map(event.ticketTypes.map((t) => [t.id, t.priceCLP] as const));

  let total = 0;
  for (const it of items) {
    const price = byId.get(it.ticketTypeId);
    if (!price) continue;
    total += price * it.qty;
  }

  total = Math.trunc(total);
  return total > 0 ? total : null;
}

export async function POST(req: NextRequest) {
  try {
    const FINTOC_SECRET_KEY =
      process.env.FINTOC_SECRET_KEY ||
      process.env.FINTOC_SECRET_API_KEY ||
      process.env.FINTOC_SECRET;

    if (!FINTOC_SECRET_KEY) {
      return NextResponse.json(
        { ok: false, error: "missing_env", detail: "Missing FINTOC secret key env (FINTOC_SECRET_KEY)." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({} as any));

    const eventId = pickString(body?.eventId);
    const items = parseItems(body?.items);

    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: "eventId_missing", detail: "Send eventId." },
        { status: 400 }
      );
    }

    if (items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "items_missing", detail: "Send items: [{ticketTypeId, qty}]." },
        { status: 400 }
      );
    }

    const amount = computeAmountFromEvent(eventId, items);
    if (!amount) {
      return NextResponse.json(
        { ok: false, error: "amount_invalid", detail: "Could not compute amount from eventId/items." },
        { status: 400 }
      );
    }

    const origin = getOrigin(req);

    const success_url =
      pickString(body?.success_url) ||
      `${origin}/checkout/success?provider=fintoc&eventId=${encodeURIComponent(eventId)}`;

    const cancel_url =
      pickString(body?.cancel_url) ||
      `${origin}/checkout/${encodeURIComponent(eventId)}?canceled=1`;

    // customer_data: al menos email o tax_id
    const buyerEmail = pickString(body?.buyerEmail) || pickString(body?.email);
    const buyerName = pickString(body?.buyerName) || pickString(body?.name);
    const buyerRut = pickString(body?.buyerRut) || pickString(body?.tax_id);

    if (!buyerEmail && !buyerRut) {
      return NextResponse.json(
        {
          ok: false,
          error: "customer_missing",
          detail: "Send buyerEmail or buyerRut to create the Checkout Session.",
        },
        { status: 400 }
      );
    }

    // Opcional: preseleccionar banco (ej: 'cl_banco_estado')
    const bankInstitutionId = pickString(body?.bank_institution_id);

    const customer_data: any = {
      ...(buyerName ? { name: buyerName } : {}),
      ...(buyerEmail ? { email: buyerEmail } : {}),
      ...(buyerRut
        ? { tax_id: { type: "cl_rut", value: buyerRut } }
        : {}),
      metadata: {
        eventId,
      },
    };

    const payload: any = {
      amount,
      currency: "CLP",
      success_url,
      cancel_url,

      // ✅ método correcto para transferencias vía banco
      payment_methods: ["payment_initiation"],

      ...(bankInstitutionId
        ? {
            payment_method_options: {
              payment_initiation: { institution_id: bankInstitutionId },
            },
          }
        : {}),

      customer_data,
    };

    console.log("[fintoc:create]", {
      keyMode: FINTOC_SECRET_KEY.startsWith("sk_live") ? "live" : "test",
      eventId,
      amount,
      bankInstitutionId: bankInstitutionId || null,
    });

    const fintocRes = await fetch("https://api.fintoc.com/v2/checkout_sessions", {
      method: "POST",
      headers: {
        Authorization: FINTOC_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await fintocRes.json().catch(() => ({}));

    if (!fintocRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          provider: "fintoc",
          status: fintocRes.status,
          fintoc_error: data?.error ?? data,
        },
        { status: fintocRes.status }
      );
    }

    const redirect_url = data?.redirect_url ?? data?.redirectUrl ?? null;
    const id = data?.id ?? null;

    return NextResponse.json({
      ok: true,
      provider: "fintoc",
      id,
      checkoutSessionId: id,
      redirect_url,
      redirectUrl: redirect_url,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
