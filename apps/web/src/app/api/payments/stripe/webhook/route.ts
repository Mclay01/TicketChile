import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { stripe } from "@/lib/stripe.server";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("missing stripe-signature", { status: 400 });

  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whsec) return new NextResponse("missing STRIPE_WEBHOOK_SECRET", { status: 500 });

  const raw = Buffer.from(await req.arrayBuffer());

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, whsec);
  } catch (err: any) {
    return new NextResponse(`webhook signature failed: ${err?.message || err}`, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Dedupe fuerte por event.id (Stripe reintenta webhooks)
    const dedupe = await client.query(
      `
      INSERT INTO webhook_events (provider, event_id)
      VALUES ('stripe', $1)
      ON CONFLICT DO NOTHING
      RETURNING event_id
      `,
      [event.id]
    );

    if (dedupe.rowCount === 0) {
      // ya procesado
      await client.query("ROLLBACK");
      return NextResponse.json({ received: true });
    }

    // 1) Pago completado
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;

      // Recomendado: Stripe debe decir "paid"
      if (session?.payment_status && session.payment_status !== "paid") {
        await client.query("COMMIT");
        return NextResponse.json({ received: true });
      }

      const holdId = pickString(session?.metadata?.holdId || "");
      const paymentId = pickString(session?.metadata?.paymentId || "");
      const buyerName = pickString(session?.metadata?.buyerName || session?.customer_details?.name || "");
      const buyerEmail = pickString(
        session?.metadata?.buyerEmail ||
          session?.customer_details?.email ||
          session?.customer_email ||
          ""
      );
      const eventTitle = pickString(session?.metadata?.eventTitle || "");

      if (!holdId || !paymentId) {
        await client.query("ROLLBACK");
        return new NextResponse("missing metadata holdId/paymentId", { status: 400 });
      }
      if (!buyerEmail.includes("@") || buyerName.length < 2 || !eventTitle) {
        await client.query("ROLLBACK");
        return new NextResponse("missing buyer metadata", { status: 400 });
      }

      // ✅ Mantener provider_ref = session.id (NO lo pises con payment_intent)
      const sessionId = pickString(session?.id || "");

      const upd = await client.query(
        `
        UPDATE payments
        SET status='PAID',
            provider_ref = COALESCE(provider_ref, $3),
            paid_at = COALESCE(paid_at, NOW()),
            updated_at = NOW()
        WHERE id=$1 AND hold_id=$2 AND provider='stripe'
        RETURNING id, hold_id
        `,
        [paymentId, holdId, sessionId]
      );

      if (upd.rowCount === 0) throw new Error("Payment no existe o provider mismatch.");

      // Emitir tickets (idempotente por hold_id)
      await finalizePaidHoldToOrderPgTx(client, {
        holdId,
        eventTitle,
        buyerName,
        buyerEmail,
        paymentId, // opcional (tu finalize lo acepta si lo dejaste)
      });

      // Backfill order_id en payments (por si acaso)
      const oRes = await client.query(`SELECT id FROM orders WHERE hold_id=$1`, [holdId]);
      const orderId = oRes.rows?.[0]?.id ? String(oRes.rows[0].id) : "";
      if (orderId) {
        await client.query(
          `UPDATE payments SET order_id=$2, updated_at=NOW() WHERE id=$1`,
          [paymentId, orderId]
        );
      }
    }

    // 2) Sesión expirada (usuario no pagó / abandonó)
    if (event.type === "checkout.session.expired") {
      const session = event.data.object as any;

      const holdId = pickString(session?.metadata?.holdId || "");
      const paymentId = pickString(session?.metadata?.paymentId || "");
      const sessionId = pickString(session?.id || "");

      // Si no hay metadata, no podemos reconciliar; no es 500: Stripe seguirá.
      if (!holdId || !paymentId) {
        await client.query("COMMIT");
        return NextResponse.json({ received: true });
      }

      await client.query(
        `
        UPDATE payments
        SET status = CASE
          WHEN status = 'PAID' THEN 'PAID'
          ELSE 'CANCELLED'
        END,
        provider_ref = COALESCE(provider_ref, $3),
        updated_at = NOW()
        WHERE id=$1 AND hold_id=$2 AND provider='stripe'
        `,
        [paymentId, holdId, sessionId]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ received: true });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return new NextResponse(`webhook error: ${String(e?.message || e)}`, { status: 500 });
  } finally {
    client.release();
  }
}
