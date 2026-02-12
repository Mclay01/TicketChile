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

// Devuelve SOLO el número de RUT (sin DV)
function rutNumberOnly(input: unknown): string | null {
  const s = pickString(input);
  if (!s) return null;

  // Deja 0-9 y K, pero para tax_id solo nos sirve el número
  const cleaned = s.toUpperCase().replace(/[^0-9K]/g, "");
  if (cleaned.length < 2) return null;

  const num = cleaned.slice(0, -1); // sin DV
  const digits = num.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length < 7) return null;
  return digits;
}

export async function POST(req: NextRequest) {
  try {
    const FINTOC_SECRET_KEY =
      process.env.FINTOC_SECRET_KEY ||
      process.env.FINTOC_SECRET_API_KEY ||
      process.env.FINTOC_SECRET;

    if (!FINTOC_SECRET_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing FINTOC secret key env (FINTOC_SECRET_KEY)." },
        { status: 500 }
      );
    }

    const keyMode = FINTOC_SECRET_KEY.startsWith("sk_live") ? "live" : "test";

    const FINTOC_RECIPIENT_ACCOUNT =
      process.env.FINTOC_RECIPIENT_ACCOUNT ||
      process.env.FINTOC_RECIPIENT_ACCOUNT_ID ||
      process.env.FINTOC_BANK_TRANSFER_RECIPIENT_ACCOUNT ||
      null;

    // ✅ En live lo exigimos, en test no te bloqueamos
    if (keyMode === "live" && !FINTOC_RECIPIENT_ACCOUNT) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_fintoc_recipient_account",
          detail:
            "Define FINTOC_RECIPIENT_ACCOUNT (required in live for payment_method_options.bank_transfer.recipient_account).",
        },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({} as any));

    const amount = parseCLPAmount(body?.amount);
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

    const currency = (body?.currency ?? "CLP") as string;
    if (currency !== "CLP") {
      return NextResponse.json(
        { ok: false, error: "currency_not_supported", detail: "This integration expects CLP." },
        { status: 400 }
      );
    }

    const origin = getOrigin(req);

    const eventId = body?.eventId ?? null;
    const success_url =
      body?.success_url ||
      `${origin}/checkout/success?provider=fintoc${eventId ? `&eventId=${encodeURIComponent(eventId)}` : ""}`;
    const cancel_url =
      body?.cancel_url ||
      `${origin}${eventId ? `/checkout/${encodeURIComponent(eventId)}` : "/checkout"}?canceled=1`;

    // Customer requerido: al menos email o tax_id (RUT)
    const email =
      typeof body?.email === "string"
        ? body.email
        : typeof body?.buyerEmail === "string"
        ? body.buyerEmail
        : null;

    // ✅ soporta tax_id directo o buyerRut
    const taxIdRaw =
      typeof body?.tax_id === "string"
        ? body.tax_id
        : typeof body?.buyerRut === "string"
        ? body.buyerRut
        : null;

    const taxId = rutNumberOnly(taxIdRaw);

    if (!email && !taxId) {
      return NextResponse.json(
        {
          ok: false,
          error: "customer_missing",
          detail: "Send customer email or tax_id (RUT) to create the Checkout Session.",
        },
        { status: 400 }
      );
    }

    const payment_method_types = ["bank_transfer"];

    // Opcional: preseleccionar banco
    const bankInstitutionId =
      typeof body?.bank_institution_id === "string" ? body.bank_institution_id : null;

    const bankTransferOptions: any = {};

    if (FINTOC_RECIPIENT_ACCOUNT) {
      bankTransferOptions.recipient_account = FINTOC_RECIPIENT_ACCOUNT;
    }
    if (bankInstitutionId) {
      bankTransferOptions.institution_id = bankInstitutionId;
    }

    const customer: any = {};
    if (email) customer.email = email;
    if (taxId) customer.tax_id = { type: "cl_rut", value: taxId };

    const payload: any = {
      flow: "payment",
      amount,
      currency: "CLP",
      success_url,
      cancel_url,
      payment_method_types,
      payment_method_options: {
        bank_transfer: bankTransferOptions,
      },
      metadata: {
        ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}),
        eventId: eventId ?? undefined,
        orderId: body?.orderId ?? undefined,
        holdId: body?.holdId ?? undefined,
      },
      customer,
    };

    console.log("[fintoc:create]", {
      keyMode,
      amount,
      currency: payload.currency,
      recipient: FINTOC_RECIPIENT_ACCOUNT ? "set" : "not_set",
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

    if (!redirect_url) {
      return NextResponse.json(
        { ok: false, error: "missing_redirect_url", detail: "Fintoc respondió sin redirect_url.", raw: data },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      provider: "fintoc",
      id,
      checkoutSessionId: id,
      redirect_url,
      redirectUrl: redirect_url,
      checkoutUrl: redirect_url, // ✅ alias para tu frontend
      raw: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
