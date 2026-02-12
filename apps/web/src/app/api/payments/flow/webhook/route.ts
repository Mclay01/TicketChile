// apps/web/src/app/api/payments/flow/webhook/route.ts
import { NextResponse } from "next/server";
import { withTx } from "@/lib/db";
import { flowGetStatus, flowVerifyWebhookSignature } from "@/lib/flow";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Flow pega aquí (urlConfirmation).
 * OJO:
 * - Flow normalmente manda x-www-form-urlencoded.
 * - Siempre respondemos 200 rápido para que no reintente.
 */
export async function POST(req: Request) {
  try {
    const ct = req.headers.get("content-type") || "";
    let form: Record<string, string> = {};

    if (ct.includes("application/x-www-form-urlencoded")) {
      const bodyText = await req.text();
      const sp = new URLSearchParams(bodyText);
      for (const [k, v] of sp.entries()) form[k] = v;
    } else if (ct.includes("application/json")) {
      const j = await req.json().catch(() => ({}));
      for (const [k, v] of Object.entries(j || {})) form[k] = String(v ?? "");
    } else {
      // intento fallback
      const bodyText = await req.text().catch(() => "");
      const sp = new URLSearchParams(bodyText);
      for (const [k, v] of sp.entries()) form[k] = v;
    }

    /**
     * Flow suele enviar:
     * - token (token del payment en Flow)
     * - optional / commerceOrder depende del endpoint
     *
     * En tu create, pusimos commerceOrder = paymentId (pay_xxx).
     * En confirm, lo más confiable es:
     * - si llega commerceOrder => es tu paymentId
     * - si no, con token consultamos estado en Flow y recuperamos commerceOrder.
     */
    const token = String(form.token || "").trim();
    const commerceOrder = String(form.commerceOrder || "").trim();

    // (opcional pero recomendado) validar firma si tú lo implementaste
    // Si tu lib/flow no tiene esto, deja el verify en true y listo.
    // Si ya tienes firma en Flow, úsalo:
    try {
      if (typeof flowVerifyWebhookSignature === "function") {
        const ok = flowVerifyWebhookSignature(form);
        if (!ok) return json(200, { ok: true }); // respondemos 200 igual, no le des info a nadie
      }
    } catch {
      // silencio
    }

    // Resolve paymentId
    let paymentId = commerceOrder;
    if (!paymentId && token) {
      const st = await flowGetStatus(token);
      if (st?.ok && st.commerceOrder) paymentId = String(st.commerceOrder);
    }

    if (!paymentId) {
      // Siempre 200 para Flow (si respondes 4xx/5xx va a reintentar)
      return json(200, { ok: true });
    }

    // 1) Leer payment + hold y si Flow dice pagado => marcar PAID
    // 2) Emitir tickets (idempotente) con finalizePaidHoldToOrderPgTx
    await withTx(async (client) => {
      // Lock del payment para evitar carreras
      const pRes = await client.query(
        `
        SELECT id, hold_id, status, provider_ref, buyer_name, buyer_email, event_title
        FROM payments
        WHERE id=$1
        LIMIT 1
        FOR UPDATE
        `,
        [paymentId]
      );

      if (pRes.rowCount === 0) return;

      const p = pRes.rows[0];
      const holdId = String(p.hold_id || "");
      const currentStatus = String(p.status || "").toUpperCase();
      const providerRef = String(p.provider_ref || ""); // aquí guardaste token flow en create
      const buyerName = String(p.buyer_name || "");
      const buyerEmail = String(p.buyer_email || "");
      const eventTitle = String(p.event_title || "");

      // Si ya está pagado, no insistimos
      if (currentStatus === "PAID") {
        // pero igual intentamos emitir si aún no se emitió (idempotente)
        if (holdId && buyerEmail.includes("@") && buyerName.length >= 2 && eventTitle) {
          await finalizePaidHoldToOrderPgTx(client, {
            holdId,
            eventTitle,
            buyerName,
            buyerEmail,
            paymentId,
          });
        }
        return;
      }

      // consultar Flow estado
      const flowToken = token || providerRef;
      if (!flowToken) return;

      const st = await flowGetStatus(flowToken);
      if (!st?.ok) return;

      // Normaliza a tu “PAID”
      const flowStatus = String(st.status || st.paymentStatus || "").toUpperCase();

      // Ajusta acá según tu lib/flow:
      // - algunos devuelven status = 2 (pagado), 1 (pendiente), 3 (rechazado)
      const isPaid =
        flowStatus === "PAID" ||
        flowStatus === "COMPLETED" ||
        flowStatus === "SUCCESS" ||
        flowStatus === "2" ||
        st.status === 2;

      const isFailed =
        flowStatus === "FAILED" ||
        flowStatus === "REJECTED" ||
        flowStatus === "CANCELLED" ||
        flowStatus === "3" ||
        st.status === 3;

      if (isPaid) {
        await client.query(
          `UPDATE payments
             SET status='PAID', paid_at=NOW(), updated_at=NOW()
           WHERE id=$1`,
          [paymentId]
        );

        if (holdId && buyerEmail.includes("@") && buyerName.length >= 2 && eventTitle) {
          await finalizePaidHoldToOrderPgTx(client, {
            holdId,
            eventTitle,
            buyerName,
            buyerEmail,
            paymentId,
          });
        }
      } else if (isFailed) {
        await client.query(
          `UPDATE payments
             SET status='FAILED', updated_at=NOW()
           WHERE id=$1`,
          [paymentId]
        );
      } else {
        // queda PENDING
        await client.query(`UPDATE payments SET status='PENDING', updated_at=NOW() WHERE id=$1`, [paymentId]);
      }
    });

    return json(200, { ok: true });
  } catch (e: any) {
    // IMPORTANTÍSIMO: Flow webhook => responde 200 igual para evitar spam de reintentos
    return json(200, { ok: true, swallowed: true });
  }
}
