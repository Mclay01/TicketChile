import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { stripe } from "@/lib/stripe.server";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = String(searchParams.get("session_id") ?? "").trim();

  if (!sessionId || !sessionId.startsWith("cs_")) {
    return json(400, { ok: false, error: "session_id inválido." });
  }

  const client = await pool.connect();
  try {
    // 1) Trae payment por provider_ref = session_id (lock para evitar doble finalize)
    await client.query("BEGIN");

    const pRes = await client.query(
      `
      SELECT
        id, hold_id, order_id, status,
        buyer_name, buyer_email, event_title, amount_clp
      FROM payments
      WHERE provider='stripe' AND provider_ref=$1
      LIMIT 1
      FOR UPDATE
      `,
      [sessionId]
    );

    if (pRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return json(404, { ok: false, error: "Pago no encontrado para ese session_id." });
    }

    const payment = pRes.rows[0];

    // 2) Si aún no está PAID, intenta reconciliar consultando a Stripe
    //    (Esto te salva cuando el webhook no llega en local)
    const statusUpper = String(payment.status || "").toUpperCase();
    if (statusUpper !== "PAID") {
      // OJO: llamada externa. Igual lo hacemos aquí porque el row está lockeado
      // y finalize es idempotente. Si te preocupa, se puede sacar fuera del TX.
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const payStatus = pickString((session as any)?.payment_status);
      const isPaid = payStatus === "paid";

      if (isPaid) {
        // Marcar PAID en DB
        await client.query(
          `
          UPDATE payments
          SET status='PAID',
              paid_at = COALESCE(paid_at, NOW()),
              updated_at = NOW()
          WHERE id=$1
          `,
          [String(payment.id)]
        );

        // Finalizar hold -> order + tickets (idempotente)
        await finalizePaidHoldToOrderPgTx(client, {
          holdId: String(payment.hold_id),
          eventTitle: String(payment.event_title || ""),
          buyerName: String(payment.buyer_name || ""),
          buyerEmail: String(payment.buyer_email || ""),
          paymentId: String(payment.id),
        });
      }
    }

    // 3) Resolver order_id (si no está en payments aún)
    let orderId = payment.order_id ? String(payment.order_id) : "";
    if (!orderId && payment.hold_id) {
      const oRes = await client.query(
        `SELECT id FROM orders WHERE hold_id=$1 LIMIT 1`,
        [String(payment.hold_id)]
      );
      orderId = oRes.rows?.[0]?.id ? String(oRes.rows[0].id) : "";
    }

    // 4) Traer tickets si existen
    let tickets: any[] = [];
    if (orderId) {
      const tRes = await client.query(
        `
        SELECT id, order_id, event_id, ticket_type_name, buyer_email, status, created_at
        FROM tickets
        WHERE order_id=$1
        ORDER BY created_at ASC
        `,
        [orderId]
      );

      tickets = tRes.rows.map((t: any) => ({
        id: String(t.id),
        orderId: String(t.order_id),
        eventId: String(t.event_id),
        ticketTypeName: String(t.ticket_type_name),
        buyerEmail: String(t.buyer_email),
        status: String(t.status),
        createdAtISO: t.created_at,
      }));
    }

    // 5) Releer status actualizado (por si lo cambiamos a PAID arriba)
    const p2 = await client.query(
      `SELECT status FROM payments WHERE id=$1 LIMIT 1`,
      [String(payment.id)]
    );
    const finalStatus = p2.rows?.[0]?.status ? String(p2.rows[0].status) : String(payment.status);

    await client.query("COMMIT");

    return json(200, {
      ok: true,
      payment: {
        id: String(payment.id),
        holdId: String(payment.hold_id),
        orderId,
        status: finalStatus,
        buyerName: String(payment.buyer_name || ""),
        buyerEmail: String(payment.buyer_email || ""),
        eventTitle: String(payment.event_title || ""),
        amountClp: Number(payment.amount_clp || 0),
      },
      tickets,
    });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return json(500, { ok: false, error: String(e?.message || e) });
  } finally {
    client.release();
  }
}
