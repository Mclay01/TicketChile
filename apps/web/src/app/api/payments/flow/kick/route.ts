import { NextRequest, NextResponse } from "next/server";
import { flowGetStatus } from "@/lib/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function readToken(req: NextRequest) {
  // Flow normalmente vuelve con POST form-data / x-www-form-urlencoded
  // pero a veces se prueba con GET ?token=
  const fromQuery = pickString(req.nextUrl.searchParams.get("token"));
  if (fromQuery) return fromQuery;

  const ct = req.headers.get("content-type") || "";

  if (req.method === "POST") {
    if (ct.includes("application/x-www-form-urlencoded")) {
      const raw = await req.text();
      const sp = new URLSearchParams(raw);
      return pickString(sp.get("token"));
    }

    // fallback: formData
    try {
      const fd = await req.formData();
      return pickString(fd.get("token"));
    } catch {
      // ignore
    }

    // fallback: json
    try {
      const j = await req.json().catch(() => ({} as any));
      return pickString(j?.token);
    } catch {
      // ignore
    }
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
  const origin = getOrigin(req);

  try {
    const token = await readToken(req);

    if (!token) {
      return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=missing_token`, origin));
    }

    const st = await flowGetStatus(token);
    const paymentId = pickString(st?.commerceOrder);

    if (!paymentId) {
      return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=missing_payment`, origin));
    }

    // status Flow: 1 pending, 2 paid, 3 rejected, 4 cancelled
    const flowStatus = Number(st?.status || 0);
    if (flowStatus === 3 || flowStatus === 4) {
      return NextResponse.redirect(
        new URL(`/checkout?canceled=1&reason=flow_${flowStatus}`, origin)
      );
    }

    // Deja que tu UI haga polling a /api/payments/status
    return NextResponse.redirect(
      new URL(`/checkout/confirm?payment_id=${encodeURIComponent(paymentId)}`, origin)
    );
  } catch (err: any) {
    return NextResponse.redirect(
      new URL(`/checkout?canceled=1&reason=${encodeURIComponent(err?.message || "flow_error")}`, origin)
    );
  }
}
