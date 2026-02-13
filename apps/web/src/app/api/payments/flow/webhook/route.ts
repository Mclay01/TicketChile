import { NextRequest, NextResponse } from "next/server";
import { flowGetStatus } from "@/lib/flow";
import { pool, withTx } from "@/lib/db";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook Flow:
 * - Flow llama a urlConfirmation (POST)
 * - Usualmente manda token, y a veces también commerceOrder.
 * - Nosotros resolvemos payment por provider_ref (=token) o por commerceOrder (=paymentId)
 * - Consultamos getStatus en Flow para confirmar estado real
 * - Si está pagado: marcamos PAID y emitimos tickets (idempotente)
 */
function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const reqId = `flow_webhook_${Math.random().toString(16).slice(2, 10)}`;

  try {
    // Flow manda x-www-form-urlencoded normalmente, pero a veces JSON.
    const contentType = req.headers.get("content-type") || "";
    let token = "";
    let commerceOrder = "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      token = pickString(form.get("token"));
      commerceOrder = pickString(form.get("commerceOrder"));
    } else {
      const body = await req.json().catch(() => ({} as any));
      token = pickString(body?.token);
      commerceOrder = pickString(body?.commerceOrder);
    }

    console.log("[flow:webhook][in]", { reqId, hasToken: !!token, hasCommerceOrder: !!commerceOrder });

    if (!token && !commerceOrder) {
      return json(400, { ok: false, error: "missing_token_or_commerceOrder" });
    }

    // 1) Confirmar estado real en Flow
    //    Si tenemos token, getStatus funciona directo.
    //    Si NO hay token, no podemos consultar estado (Flow getStatus requiere token).
    if (!token) {
      // sin token no podemos validar => evitamos emitir tickets a ciegas
      return json(400, { ok: false, error: "missing_token" });
    }

    const st = await flowGetStatus(token);

    // status Flow:
    // 1 pending, 2 paid, 3 rejected, 4 cancelled
    const flowStatus = Number(st?.status || 0);
    const isPaid = flowStatus === 2;

    // 2) Resolver paymentId + datos desde DB
    //    provider_ref guarda el token (según tu create/route.ts)
    const paymentIdFromFlow = pickString(st?.commerceOrder) || commerceOrder;

    if (!paymentIdFromFlow) {
      return json(400, { ok: false, error: "missing_commerceOrder_after_status" });
    }

    const result = await withTx(async (client) => {
      const pRes = await client.query(
        `
        SELECT
          id, hold_id, order_id, status, provider, provider_ref,
          buyer_name, buyer_email, event_title
        FROM payments
        WHERE id=$1
           OR provider_ref=$2
        LIMIT 1
        FOR UPDATE
        `,
        [paymentIdFromFlow, token]
      );

      if (pRes.rowCount === 0) {
        // No existe el pago en DB (o token no coincide)
        return { ok: false as const, status: 404 as const, payload: { error: "payment_not_found" } };
      }

      const payment = pRes.rows[0];
      const paymentId = String(payment.id);
      const holdId = String(payment.hold_id || "");
      const buyerEmail = String(payment.buyer_email || "");
      const buyerName = String(payment.buyer_name || "");
      const eventTitle = String(payment.event_title || "");

      // Guardamos estados Flow “tal cual” a tu estado interno:
      // paid => PAID
      // rejected/cancel => FAILED
      // pending => PENDING
      const nextStatus =
        flowStatus === 2 ? "PAID" : flowStatus === 1 ? "PENDING" : flowStatus === 3 ? "FAILED" : "CANCELED";

      // Si el pago ya estaba PAID, no hacemos más (idempotencia)
      const currentStatus = String(payment.status || "").toUpperCase();
      if (currentStatus !== nextStatus) {
        await client.query(
          `UPDATE payments SET status=$2, updated_at=NOW() WHERE id=$1`,
          [paymentId, nextStatus]
        );
      }

      if (!isPaid) {
        return {
          ok: true as const,
          status: 200 as const,
          payload: { ok: true, provider: "flow", paymentId, flowStatus, status: nextStatus },
        };
      }

      // ✅ Si está pagado: emitir tickets (idempotente)
      // Necesitamos mínimos para finalize (igual que en status/route.ts)
      if (holdId && buyerEmail.includes("@") && buyerName.length >= 2 && eventTitle) {
        try {
          await finalizePaidHoldToOrderPgTx(client, {
            holdId,
            eventTitle,
            buyerName,
            buyerEmail,
            paymentId,
          });
        } catch {
          // silencio: ya pudo emitirse por otra request / carrera
        }
      }

      return {
        ok: true as const,
        status: 200 as const,
        payload: { ok: true, provider: "flow", paymentId, flowStatus, status: "PAID" },
      };
    });

    return json(result.status, result.payload);
  } catch (e: any) {
    console.log("[flow:webhook][err]", { err: String(e?.message || e) });
    return json(500, { ok: false, error: "internal_error", detail: String(e?.message || e) });
  }
}
