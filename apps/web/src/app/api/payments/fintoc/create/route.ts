// apps/web/app/api/payments/fintoc/create/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCLPAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n > 0 ? n : null;
  }

  if (typeof value === "string") {
    // Acepta "$12.000", "12,000", "12000", etc.
    const digits = value.replace(/[^\d]/g, "");
    if (!digits) return null;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return null;
}

function getOrigin(req: NextRequest) {
  // Prioriza env para producción
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    req.headers.get("origin") ||
    "http://localhost:3000"
  );
}

function keyMode(key: string) {
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const FINTOC_SECRET_KEY =
      process.env.FINTOC_SECRET_KEY ||
      process.env.FINTOC_SECRET_API_KEY ||
      process.env.FINTOC_SECRET;

    if (!FINTOC_SECRET_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_fintoc_secret_key",
          detail: "Missing FINTOC secret key env (FINTOC_SECRET_KEY).",
        },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({} as any));

    // Acepta varios nombres comunes por si tu frontend manda otro
    const amount = parseCLPAmount(body?.amount ?? body?.total ?? body?.price);
    if (!amount) {
      return NextResponse.json(
        {
          ok: false,
          error: "amount_invalid_or_missing",
          detail: "Amount must be an integer CLP (e.g. 12000).",
        },
        { status: 400 }
      );
    }

    const currencyRaw = body?.currency ?? "CLP";
    const currency = String(currencyRaw).toUpperCase();
    if (currency !== "CLP") {
      return NextResponse.json(
        {
          ok: false,
          error: "currency_not_supported",
          detail: "This integration expects CLP.",
        },
        { status: 400 }
      );
    }

    const origin = getOrigin(req);

    const eventId = body?.eventId ?? null;
    const success_url =
      body?.success_url ||
      `${origin}/checkout/success?provider=fintoc${
        eventId ? `&eventId=${encodeURIComponent(eventId)}` : ""
      }`;
    const cancel_url =
      body?.cancel_url ||
      `${origin}${eventId ? `/checkout/${encodeURIComponent(eventId)}` : "/checkout"}?canceled=1`;

    // Fintoc Checkout Sessions usa customer_email
    const customer_email =
      typeof body?.customer_email === "string"
        ? body.customer_email
        : typeof body?.email === "string"
          ? body.email
          : null;

    if (!customer_email) {
      return NextResponse.json(
        {
          ok: false,
          error: "customer_missing",
          detail: "Send customer_email (or email) to create the Checkout Session.",
        },
        { status: 400 }
      );
    }

    const payload = {
      amount,
      currency: "CLP",
      customer_email,
      success_url,
      cancel_url,
      metadata: {
        ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}),
        eventId: eventId ?? undefined,
        orderId: body?.orderId ?? undefined,
      },
    };

    // Log mínimo, sin filtrar datos sensibles
    console.log("[fintoc:create]", {
      mode: keyMode(FINTOC_SECRET_KEY),
      amount,
      currency: "CLP",
      hasEmail: true,
    });

    // ✅ Endpoint y campos según docs oficiales
    const fintocRes = await fetch("https://api.fintoc.com/v1/checkout_sessions", {
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

    const redirect_url = data?.redirect_url ?? null;
    const id = data?.id ?? null;
    const mode = data?.mode ?? null;

    return NextResponse.json({
      ok: true,
      provider: "fintoc",
      id,
      checkoutSessionId: id,
      redirect_url,
      redirectUrl: redirect_url,
      mode, // <- esto te permite confirmar live/test en frontend si quieres
      raw: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
