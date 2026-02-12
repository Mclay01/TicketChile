import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FLOW_API_BASE = "https://api.flow.cl";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getOrigin(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    req.headers.get("origin") ||
    "http://localhost:3000"
  );
}

function flowSign(params: Record<string, string>, secretKey: string) {
  const keys = Object.keys(params).sort();
  let toSign = "";
  for (const k of keys) toSign += k + params[k];
  return createHmac("sha256", secretKey).update(toSign).digest("hex");
}

async function flowGetStatus(token: string, apiKey: string, secretKey: string) {
  const base = { apiKey, token };
  const s = flowSign(base, secretKey);
  const qs = new URLSearchParams({ ...base, s });
  const r = await fetch(`${FLOW_API_BASE}/payment/getStatus?${qs.toString()}`, { method: "GET" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message || j?.error || `Flow getStatus HTTP ${r.status}`);
  return j as any;
}

async function readToken(req: NextRequest) {
  // Flow vuelve por POST form; pero a veces puedes testear por GET ?token=
  const fromQuery = (req.nextUrl.searchParams.get("token") || "").trim();
  if (fromQuery) return fromQuery;

  if (req.method === "POST") {
    const raw = await req.text();
    const sp = new URLSearchParams(raw);
    const t = (sp.get("token") || "").trim();
    if (t) return t;
  }

  return "";
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  try {
    const FLOW_API_KEY = mustEnv("FLOW_API_KEY");
    const FLOW_SECRET_KEY = mustEnv("FLOW_SECRET_KEY");

    const token = await readToken(req);
    const origin = getOrigin(req);

    if (!token) {
      return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=missing_token`, origin));
    }

    const st = await flowGetStatus(token, FLOW_API_KEY, FLOW_SECRET_KEY);
    const paymentId = String(st?.commerceOrder || "").trim();

    if (!paymentId) {
      return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=missing_payment`, origin));
    }

    // Redirige a tu confirm (tu UI ya hace polling)
    return NextResponse.redirect(
      new URL(`/checkout/confirm?payment_id=${encodeURIComponent(paymentId)}`, origin)
    );
  } catch (err: any) {
    const origin = getOrigin(req);
    return NextResponse.redirect(
      new URL(`/checkout?canceled=1&reason=${encodeURIComponent(err?.message || "flow_error")}`, origin)
    );
  }
}
