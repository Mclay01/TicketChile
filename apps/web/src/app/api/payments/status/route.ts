import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const paymentId = String(searchParams.get("payment_id") ?? "").trim();

  if (!paymentId) return json(400, { ok: false, error: "payment_id requerido." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const pRes = await client.query(
      `
      SELECT
        id, hold_id, order_id, status, provider,
        buyer_name, buyer_email, event_title, amount_clp
      FROM payments
      WHERE id=$1
      LIMIT 1
      FOR UPDATE
      `,
      [paymentId]
    );

    if (pRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return json(404, { ok: false, error: "Pago no encontrado." });
    }

    const payment = pRes.rows[0];
    const statusUpper = String(payment.status || "").toUpperCase();

    // resolver order_id (si no está)
    let orderId = payment.order_id ? String(payment.order_id) : "";
    if (!orderId && payment.hold_id) {
      const oRes = await client.query(`SELECT id FROM orders WHERE hold_id=$1 LIMIT 1`, [
        String(payment.hold_id),
      ]);
      orderId = oRes.rows?.[0]?.id ? String(oRes.rows[0].id) : "";
    }

    // tickets (previo)
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

    // ✅ NUEVO: si ya está PAID pero aún no hay tickets, intentar emitir aquí mismo (idempotente)
    if (statusUpper === "PAID" && (!orderId || tickets.length === 0)) {
      const holdId = String(payment.hold_id || "");
      const buyerEmail = String(payment.buyer_email || "");
      const buyerName = String(payment.buyer_name || "");
      const eventTitle = String(payment.event_title || "");

      // solo si hay datos mínimos; si faltan, no rompemos.
      if (holdId && buyerEmail.includes("@") && buyerName.length >= 2 && eventTitle) {
        try {
          await finalizePaidHoldToOrderPgTx(client, {
            holdId,
            eventTitle,
            buyerName,
            buyerEmail,
            paymentId: String(payment.id),
          });
        } catch {
          // silencio: webhook / otra request pudo ganar la carrera (idempotencia)
        }
      }

      // re-resolver orderId post-finalize
      if (holdId) {
        const oRes2 = await client.query(`SELECT id FROM orders WHERE hold_id=$1 LIMIT 1`, [holdId]);
        orderId = oRes2.rows?.[0]?.id ? String(oRes2.rows[0].id) : orderId;
      }

      // re-cargar tickets post-finalize
      if (orderId) {
        const tRes2 = await client.query(
          `
          SELECT id, order_id, event_id, ticket_type_name, buyer_email, status, created_at
          FROM tickets
          WHERE order_id=$1
          ORDER BY created_at ASC
          `,
          [orderId]
        );

        tickets = tRes2.rows.map((t: any) => ({
          id: String(t.id),
          orderId: String(t.order_id),
          eventId: String(t.event_id),
          ticketTypeName: String(t.ticket_type_name),
          buyerEmail: String(t.buyer_email),
          status: String(t.status),
          createdAtISO: t.created_at,
        }));
      }
    }

    await client.query("COMMIT");

    return json(200, {
      ok: true,
      payment: {
        id: String(payment.id),
        holdId: String(payment.hold_id),
        orderId,
        provider: String(payment.provider || ""),
        status: String(payment.status || ""),
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
