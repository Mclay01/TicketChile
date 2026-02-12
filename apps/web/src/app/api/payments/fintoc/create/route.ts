import { NextRequest, NextResponse } from "next/server";
import { getEventById } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiItem = { ticketTypeId: string; qty: number };

function parseCLPAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n > 0 ? n : null;
  }

  if (typeof value === "string") {
    const digits = value.replace(/[^\d]/g, "");
    if (!digits) return null;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return null;
}

function getOrigin(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    req.headers.get("origin") ||
    "http://localhost:3000"
  );
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeEmail(v: any) {
  return pickString(v).toLowerCase();
}

function cleanRut(input: string) {
  return String(input || "")
    .toUpperCase()
    .replace(/[^0-9K]/g, "");
}

function normalizeRut(input: string) {
  const c = cleanRut(input);
  if (c.length < 2) return "";
  const num = c.slice(0, -1);
  const dv = c.slice(-1);
  return `${num}-${dv}`;
}

function computeAmountFromEvent(eventId: string, items: ApiItem[]) {
  const event = getEventById(eventId);
  if (!event) {
    return { ok: false as const, error: `event_not_found: ${eventId}` };
  }

  const byId = new Map(event.ticketTypes.map((t) => [t.id, t]));

  let total = 0;
  for (const it of items) {
    const id = pickString(it?.ticketTypeId);
    const qty = Math.floor(Number(it?.qty));
    if (!id || !Number.isFinite(qty) || qty <= 0) continue;

    const tt: any = byId.get(id);
    if (!tt) {
      return { ok: false as const, error: `ticket_type_not_found: ${id}` };
    }

    const price = Number(tt.priceCLP);
    if (!Number.isFinite(price) || price <= 0) {
      return { ok: false as const, error: `ticket_price_invalid: ${id}` };
    }

    total += price * qty;
  }

  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false as const, error: "cart_total_invalid_or_zero" };
  }

  return { ok: true as const, total };
}

export async function POST(req: NextRequest) {
  try {
    const FINTOC_SECRET_KEY =
      process.env.FINTOC_SECRET_KEY ||
      process.env.FINTOC_SECRET_API_KEY ||
      process.env.FINTOC_SECRET;

    if (!FINTOC_SECRET_KEY) {
      return NextResponse.json(
        { ok: false, error: "missing_fintoc_secret_key", detail: "Define FINTOC_SECRET_KEY (sk_test_ / sk_live_)." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({} as any));

    const origin = getOrigin(req);

    const eventId = pickString(body?.eventId);

    const success_url =
      pickString(body?.success_url) ||
      `${origin}/checkout/success?provider=fintoc${eventId ? `&eventId=${encodeURIComponent(eventId)}` : ""}`;

    const cancel_url =
      pickString(body?.cancel_url) ||
      `${origin}${eventId ? `/checkout/${encodeURIComponent(eventId)}` : "/checkout"}?canceled=1`;

    // 1) Amount: si viene explícito, úsalo. Si no, calcúlalo desde event+items.
    let amount = parseCLPAmount(body?.amount);

    const rawItems = Array.isArray(body?.items) ? (body.items as any[]) : [];
    const items: ApiItem[] = rawItems
      .map((x) => ({
        ticketTypeId: pickString(x?.ticketTypeId),
        qty: Math.floor(Number(x?.qty)),
      }))
      .filter((x) => x.ticketTypeId && Number.isFinite(x.qty) && x.qty > 0);

    if (!amount) {
      if (!eventId) {
        return NextResponse.json(
          { ok: false, error: "amount_missing", detail: "Send amount OR send eventId + items to compute total." },
          { status: 400 }
        );
      }
      const computed = computeAmountFromEvent(eventId, items);
      if (!computed.ok) {
        return NextResponse.json(
          { ok: false, error: "amount_compute_failed", detail: computed.error },
          { status: 400 }
        );
      }
      amount = computed.total;
    }

    const currency = String(body?.currency ?? "CLP").toUpperCase();
    if (currency !== "CLP") {
      return NextResponse.json(
        { ok: false, error: "currency_not_supported", detail: "This integration expects CLP." },
        { status: 400 }
      );
    }

    // 2) Customer: al menos email o tax_id (RUT)
    const buyerEmail = normalizeEmail(body?.buyerEmail ?? body?.email);
    const buyerName = pickString(body?.buyerName ?? body?.name);
    const buyerRut = normalizeRut(body?.buyerRut ?? body?.tax_id ?? "");

    if (!buyerEmail && !buyerRut) {
      return NextResponse.json(
        { ok: false, error: "customer_missing", detail: "Send buyerEmail or buyerRut (tax_id) to create the Checkout Session." },
        { status: 400 }
      );
    }

    // 3) Payload según “Accept a payment” (Checkout Sessions)
    //    Importante: NO usamos recipient_account aquí.
    //    Puedes omitir payment_methods y dejar que Fintoc muestre lo habilitado en tu cuenta. :contentReference[oaicite:1]{index=1}
    const payload: any = {
      amount,
      currency: "CLP",
      success_url,
      cancel_url,
      metadata: {
        ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}),
        eventId: eventId || undefined,
        orderId: pickString(body?.orderId) || undefined,
        holdId: pickString(body?.holdId) || undefined,
      },
    };

    // customer (formato base del doc)
    if (buyerEmail || buyerRut) {
      payload.customer = {
        ...(buyerRut
          ? { tax_id: { type: "cl_rut", value: buyerRut.replace("-", "") } }
          : {}),
        ...(buyerName ? { name: buyerName } : {}),
        ...(buyerEmail ? { email: buyerEmail } : {}),
        metadata: {},
      };
    }

    // Si quieres forzar el método (opcional): descomenta esto.
    // OJO: en el doc aparece como "payment_initiation" para preselección. :contentReference[oaicite:2]{index=2}
    // const institutionId = pickString(body?.bank_institution_id);
    // payload.payment_methods = ["payment_initiation"];
    // if (institutionId) {
    //   payload.payment_method_options = {
    //     payment_initiation: { institution_id: institutionId },
    //   };
    // }
    // Y si usas payment_methods, el doc usa customer_data. Lo dejamos por compatibilidad:
    // payload.customer_data = payload.customer;

    console.log("[fintoc:create]", {
      keyMode: FINTOC_SECRET_KEY.startsWith("sk_live") ? "live" : "test",
      eventId: eventId || null,
      amount,
    });

    const fintocRes = await fetch("https://api.fintoc.com/v2/checkout_sessions", {
      method: "POST",
      headers: {
        Authorization: FINTOC_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const raw = await fintocRes.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    console.log("[fintoc:create:resp]", {
      status: fintocRes.status,
      ok: fintocRes.ok,
      hasBody: Boolean(raw),
    });

    if (!fintocRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          provider: "fintoc",
          status: fintocRes.status,
          fintoc_error: data?.error ?? data ?? raw ?? "unknown_error",
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
      checkoutUrl: redirect_url, // por si tu frontend prioriza esto
      raw: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
