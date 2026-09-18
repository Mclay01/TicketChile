import { AccessError, accessResponse } from "@/lib/access.server";
import { deliverPaidOrder } from "@/lib/paid-ticket-delivery.server";
import type { PaymentRow } from "@/lib/payment-access.server";
import { NextResponse } from "next/server";
import { pool, withTx } from "@/lib/db";
import {
  WebpayPlus,
  Options,
  Environment,
  IntegrationApiKeys,
  IntegrationCommerceCodes,
} from "transbank-sdk";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeBaseUrl(u: string) {
  return String(u || "").replace(/\/+$/, "");
}

// ✅ Base URL robusta (APP_BASE_URL manda; si no, host actual)
function baseUrlFromRequest(req: Request) {
  const envBase = normalizeBaseUrl(String(process.env.APP_BASE_URL || "").trim());
  if (envBase) return envBase;

  const u = new URL(req.url);
  return normalizeBaseUrl(`${u.protocol}//${u.host}`);
}

function webpayOptions(): Options {
  const env =
    process.env.WEBPAY_ENV === "production" ? Environment.Production : Environment.Integration;

  if (env === Environment.Production) {
    const commerceCode = process.env.WEBPAY_COMMERCE_CODE;
    const apiKey = process.env.WEBPAY_API_KEY;
    if (!commerceCode || !apiKey) {
      throw new Error("Faltan WEBPAY_COMMERCE_CODE / WEBPAY_API_KEY para producción.");
    }
    return new Options(commerceCode, apiKey, env);
  }

  return new Options(
    process.env.WEBPAY_COMMERCE_CODE || IntegrationCommerceCodes.WEBPAY_PLUS,
    process.env.WEBPAY_API_KEY || IntegrationApiKeys.WEBPAY,
    env
  );
}

async function handleReturn(req: Request, payload: { tokenWs: string; tbkToken: string; tbkOrder: string }) {
  const base = baseUrlFromRequest(req);
  const token = payload.tokenWs.trim();
  // Browser cancellation fields are not evidence: never mutate by order ID.
  if (!token || payload.tbkToken) return NextResponse.redirect(`${base}/?canceled=1`, 303);
  try {
    if (token.length > 512) throw new AccessError(400, "INVALID_INPUT", "Token invalido.");
    const known = await pool.query<PaymentRow>(`SELECT * FROM payments WHERE provider='webpay' AND provider_ref=$1`, [token]);
    if (!known.rows[0]) throw new AccessError(404, "NOT_FOUND", "Pago no encontrado.");
    const transaction = new WebpayPlus.Transaction(webpayOptions());
    const response = await transaction.commit(token);
    const outcome = await withTx(async client => {
      const result = await client.query<PaymentRow>(
        `SELECT * FROM payments WHERE id=$1 AND provider='webpay' AND provider_ref=$2 FOR UPDATE`, [known.rows[0].id, token],
      );
      const payment = result.rows[0];
      if (!payment || response.buy_order !== payment.id || response.session_id !== payment.hold_id ||
          Number(response.amount) !== Number(payment.amount_clp) || payment.currency !== "CLP") {
        throw new AccessError(409, "PAYMENT_MISMATCH", "No se pudo verificar el pago.");
      }
      const approved = response.response_code === 0 && response.status === "AUTHORIZED";
      if (!approved && payment.status !== "PAID") {
        await client.query(`UPDATE payments SET status='CANCELLED', updated_at=NOW() WHERE id=$1`, [payment.id]);
        return { paymentId: payment.id, orderId: "" };
      }
      await client.query(`UPDATE payments SET status='PAID', paid_at=COALESCE(paid_at,NOW()), updated_at=NOW() WHERE id=$1`, [payment.id]);
      await finalizePaidHoldToOrderPgTx(client, { holdId: payment.hold_id, paymentId: payment.id,
        eventTitle: payment.event_title, buyerName: payment.buyer_name, buyerEmail: payment.buyer_email });
      const order = await client.query<{ id: string }>(`SELECT id FROM orders WHERE hold_id=$1`, [payment.hold_id]);
      return { paymentId: payment.id, orderId: order.rows[0]?.id || "" };
    });
    if (outcome.orderId) await deliverPaidOrder(outcome.orderId).catch(() => undefined);
    const redirect = NextResponse.redirect(`${base}/checkout/confirm?payment_id=${encodeURIComponent(outcome.paymentId)}`, 303);
    redirect.headers.set("Cache-Control", "private, no-store");
    redirect.headers.set("Referrer-Policy", "no-referrer");
    return redirect;
  } catch (error) { return accessResponse(error); }
}
export async function POST(req: Request) {
  const form = await req.formData();
  return handleReturn(req, { tokenWs: String(form.get("token_ws") || ""),
    tbkToken: String(form.get("TBK_TOKEN") || ""), tbkOrder: String(form.get("TBK_ORDEN_COMPRA") || "") });
}
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  return handleReturn(req, { tokenWs: params.get("token_ws") || "",
    tbkToken: params.get("TBK_TOKEN") || "", tbkOrder: params.get("TBK_ORDEN_COMPRA") || "" });
}
