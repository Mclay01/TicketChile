import { NextResponse } from "next/server";
import { getBuyerEmail } from "@/lib/buyer-guard.server";
import { requireBuyerEmail } from "@/lib/ticket-access.server";
import { ownedPayment } from "@/lib/payment-access.server";
import { reconcileFlow } from "@/lib/flow-reconcile.server";
import { accessResponse, privateJson, requireSameOrigin } from "@/lib/access.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function redirect(req: Request, path: string) {
  const response = NextResponse.redirect(new URL(path, req.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const email = await getBuyerEmail();
    if (!email) return redirect(req, `/signin?callbackUrl=${encodeURIComponent(url.pathname + url.search)}`);
    const token = url.searchParams.get("token") || "";
    const payment = await ownedPayment(email, { provider: "flow", token });
    return redirect(req, `/checkout/confirm?payment_id=${encodeURIComponent(payment.id)}&flow_token=${encodeURIComponent(token)}`);
  } catch (error) { return accessResponse(error); }
}
export async function POST(req: Request) {
  try {
    // Provider browser return: navigation only. GET receives the SameSite cookie.
    if (!req.headers.get("content-type")?.includes("application/json")) {
      const form = await req.formData();
      const token = String(form.get("token") || "").slice(0, 512);
      return redirect(req, `/api/payments/flow/kick?token=${encodeURIComponent(token)}`);
    }
    requireSameOrigin(req);
    const email = await requireBuyerEmail();
    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token : "";
    const paymentId = typeof body?.paymentId === "string" ? body.paymentId : undefined;
    return privateJson(200, { ok: true, ...await reconcileFlow(token, { email, paymentId }) });
  } catch (error) { return accessResponse(error); }
}
