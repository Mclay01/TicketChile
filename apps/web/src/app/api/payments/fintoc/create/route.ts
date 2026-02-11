import { NextResponse } from "next/server";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function parsePositiveInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

function safeJsonParse(raw: string) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizeCurrency(v: any) {
  const c = String(v || "").toUpperCase().trim();
  if (c === "CLP" || c === "MXN") return c;
  return "CLP";
}

function getBaseUrl(req: Request) {
  // Prioridad: env -> headers (para Vercel / reverse proxy)
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "";
  if (envUrl) return envUrl.replace(/\/+$/, "");

  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (!host) return "";
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  const secret =
    process.env.FINTOC_SECRET_KEY ||
    process.env.FINTOC_SECRET_API_KEY ||
    process.env.FINTOC_SECRET ||
    "";

  if (!secret) {
    return NextResponse.json(
      { error: "Falta FINTOC_SECRET_KEY en variables de entorno." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido (no JSON)." }, { status: 400 });
  }

  // Lo mínimo que Fintoc exige
  const amount = parsePositiveInt(body.amount);
  if (!amount) {
    // devolvemos el mismo “estilo” de error que viste para que sea obvio
    return NextResponse.json({ error: "amount_invalid_or_missing" }, { status: 400 });
  }

  const currency = normalizeCurrency(body.currency);

  const baseUrl = getBaseUrl(req);
  const successUrl =
    pickString(body.success_url) ||
    pickString(body.successUrl) ||
    (baseUrl ? `${baseUrl}/checkout/confirm?provider=fintoc` : "");
  const cancelUrl =
    pickString(body.cancel_url) ||
    pickString(body.cancelUrl) ||
    (baseUrl ? `${baseUrl}/eventos?canceled=1` : "");

  if (!successUrl || !cancelUrl) {
    return NextResponse.json(
      { error: "Faltan success_url/cancel_url (o no pude inferir base URL)." },
      { status: 400 }
    );
  }

  // Customer (v2)
  const customerName = pickString(body?.customer?.name) || pickString(body.buyerName);
  const customerEmail = pickString(body?.customer?.email) || pickString(body.email) || pickString(body.buyerEmail);

  // Tax id según docs (cl_rut + value como string)
  // Nota: en docs lo mandan como número sin DV en `value`. :contentReference[oaicite:2]{index=2}
  const taxIdType = pickString(body?.customer?.tax_id?.type) || "cl_rut";
  const taxIdValue = pickString(body?.customer?.tax_id?.value) || "";

  const customer: any = {
    name: customerName || undefined,
    email: customerEmail || undefined,
    metadata: body?.customer?.metadata && typeof body.customer.metadata === "object" ? body.customer.metadata : {},
  };

  if (taxIdValue) {
    customer.tax_id = { type: taxIdType, value: taxIdValue };
  }

  const metadata =
    body?.metadata && typeof body.metadata === "object"
      ? body.metadata
      : {};

  const payload = {
    amount,
    currency,
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer,
    metadata,
  };

  const fintocRes = await fetch("https://api.fintoc.com/v2/checkout_sessions", {
    method: "POST",
    headers: {
      Authorization: secret, // así lo muestra el ejemplo oficial :contentReference[oaicite:3]{index=3}
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await fintocRes.text();
  const data = safeJsonParse(raw);

  if (!fintocRes.ok) {
    // Le devolvemos el error tal cual (para debug rápido)
    const msg =
      (typeof data?.error === "string" && data.error) ||
      (typeof data?.message === "string" && data.message) ||
      raw?.slice(0, 220) ||
      `Fintoc error HTTP ${fintocRes.status}`;

    return NextResponse.json({ error: msg, details: data ?? raw }, { status: fintocRes.status });
  }

  const redirectUrl =
    pickString(data?.redirect_url) ||
    pickString(data?.redirectUrl) ||
    pickString(data?.checkoutUrl) ||
    pickString(data?.url);

  if (!redirectUrl) {
    return NextResponse.json(
      { error: "Fintoc respondió OK pero sin redirect_url.", details: data ?? raw },
      { status: 502 }
    );
  }

  return NextResponse.json({
    status: "CREATED",
    checkoutUrl: redirectUrl,
    fintoc: {
      id: pickString(data?.id),
      url: redirectUrl,
      mode: pickString(data?.mode), // test / live según key :contentReference[oaicite:4]{index=4}
    },
  });
}
