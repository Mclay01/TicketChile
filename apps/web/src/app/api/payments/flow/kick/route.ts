import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { flowGetStatus } from "@/lib/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustOrigin(req: NextRequest) {
  // En PROD: usa SIEMPRE env. Evita localhost.
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (env) return env;

  // Dev fallback
  return req.headers.get("origin") || req.nextUrl.origin || "http://localhost:3000";
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

async function readJson(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function readToken(req: NextRequest) {
  // 1) query ?token=
  const fromQuery = pickString(req.nextUrl.searchParams.get("token"));
  if (fromQuery) return fromQuery;

  // 2) body JSON { token } o { flow_token }
  if (req.method === "POST") {
    const j = await readJson(req);
    const t = pickString(j?.token) || pickString(j?.flow_token);
    if (t) return t;
  }

  // 3) form-urlencoded / formData (por si Flow pega return aquí con POST)
  const ct = req.headers.get("content-type") || "";
  if (req.method === "POST") {
    if (ct.includes("application/x-www-form-urlencoded")) {
      const raw = await req.text();
      const sp = new URLSearchParams(raw);
      return pickString(sp.get("token"));
    }

    try {
      const fd = await req.formData();
      return pickString(fd.get("token"));
    } catch {
      // ignore
    }
  }

  return "";
}

async function readPaymentId(req: NextRequest) {
  // 1) query ?payment_id= o ?paymentId=
  const q1 = pickString(req.nextUrl.searchParams.get("payment_id"));
  if (q1) return q1;

  const q2 = pickString(req.nextUrl.searchParams.get("paymentId"));
  if (q2) return q2;

  // 2) body JSON { paymentId } o { payment_id }
  if (req.method === "POST") {
    const j = await readJson(req);
    const p = pickString(j?.paymentId) || pickString(j?.payment_id);
    if (p) return p;
  }

  return "";
}

async function lookupTokenByPaymentId(paymentId: string) {
  if (!paymentId) return "";
  const r = await pool.query(
    `SELECT provider_ref
       FROM payments
      WHERE id = $1
        AND provider = 'flow'
      LIMIT 1`,
    [paymentId]
  );
  return pickString(r.rows?.[0]?.provider_ref);
}

async function kickFinalize(origin: string, token: string) {
  // Llamada interna al confirm para que ejecute finalizePaidPayment + dedupe webhook_events.
  // OJO: confirm espera x-www-form-urlencoded con "token".
  const body = new URLSearchParams({ token });

  await fetch(`${origin}/api/payments/flow/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body,
  }).catch(() => null);
}

async function handle(req: NextRequest) {
  const origin = mustOrigin(req);

  // Puede venir por token, por paymentId, o ambos.
  const paymentIdFromReq = await readPaymentId(req);
  let token = await readToken(req);

  // Si no hay token, pero sí paymentId, lo buscamos en DB (provider_ref).
  if (!token && paymentIdFromReq) {
    token = await lookupTokenByPaymentId(paymentIdFromReq);
  }

  if (!token && !paymentIdFromReq) {
    return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=missing_token`, origin));
  }

  try {
    // 1) Consultar Flow por token si lo tenemos (para obtener commerceOrder = paymentId y status)
    let paymentId = paymentIdFromReq;

    if (token) {
      const st = await flowGetStatus(token);
      const commerceOrder = pickString(st?.commerceOrder);
      if (commerceOrder) paymentId = commerceOrder;

      const flowStatus = Number(st?.status || 0);
      // status Flow: 1 pending, 2 paid, 3 rejected, 4 cancelled

      if (flowStatus === 3 || flowStatus === 4) {
        return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=flow_${flowStatus}`, origin));
      }

      // Si está pagado → forzamos confirm (emitir tickets) aunque el webhook no haya llegado.
      if (flowStatus === 2) {
        await kickFinalize(origin, token);
      }
    }

    if (!paymentId) {
      return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=missing_payment`, origin));
    }

    // 2) Redirect a confirm con flow_token (tu UI lo usa)
    const url = new URL(`/checkout/confirm?payment_id=${encodeURIComponent(paymentId)}`, origin);
    if (token) url.searchParams.set("flow_token", token);

    return NextResponse.redirect(url);
  } catch (err: any) {
    return NextResponse.redirect(
      new URL(`/checkout?canceled=1&reason=${encodeURIComponent(err?.message || "flow_error")}`, origin)
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
