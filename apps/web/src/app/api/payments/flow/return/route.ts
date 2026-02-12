import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const paymentId = pickString(url.searchParams.get("payment_id"));

  const raw = await req.text();
  const sp = new URLSearchParams(raw);
  const token = pickString(sp.get("token"));

  // Si tienes /checkout/confirm usando payment_id, lo mantenemos.
  // Agregamos token por si después quieres mostrar “pendiente” o auditar.
  const dest = paymentId
    ? `/checkout/confirm?payment_id=${encodeURIComponent(paymentId)}${token ? `&flow_token=${encodeURIComponent(token)}` : ""}`
    : `/checkout/confirm${token ? `?flow_token=${encodeURIComponent(token)}` : ""}`;

  return NextResponse.redirect(new URL(dest, url.origin), 303);
}
