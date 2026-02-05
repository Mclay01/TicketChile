import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { pool } from "@/lib/db";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function timingSafeEq(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function parseFintocSignature(header: string) {
  // "t=...,v1=..."
  const parts = header.split(",").map((s) => s.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2) || "";
  const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3) || "";
  return { t, v1 };
}

export async function POST(req: Request) {
  const secret = process.env.FINTOC_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("missing FINTOC_WEBHOOK_SECRET", { status: 500 });

  const sigHeader = req.headers.get("Fintoc-Signature") || "";
  if (!sigHeader) return new NextResponse("missing Fintoc-Signature", { status: 400 });

  const rawBody = await req.text();
  const { t, v1 } = parseFintocSignature(sigHeader);
  if (!t || !v1) return new NextResponse("invalid signature header", { status: 400 });

  const payloadToSign = `${t}.${rawBody}`;
  const computed = crypto.createHmac("sha256", secret).update(payloadToSign).digest("hex");

  if (!timingSafeEq(computed, v1)) {
    return new NextResponse("invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // dedupe
    const dedupe = await client.query(
      `
      INSERT INTO webhook_events (provider, event_id)
      VALUES ('fintoc', $1)
      ON CONFLICT DO NOTHING
      RETURNING event_id
      `,
      [String(event?.id || "")]
    );

    if (dedupe.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ received: true });
    }

    const type = String(event?.type || "");
    const data = event?.data || {};
    const object = String(data?.object || "");
    const checkoutSessionId = String(data?.id || "");
    const status = String(data?.status || "");

    // fallback metadata
    const meta = data?.metadata || {};
    const paymentIdFromMeta = String(meta?.paymentId || "").trim();
    const holdIdFromMeta = String(meta?.holdId || "").trim();

    if (object !== "checkout_session" || !checkoutSessionId) {
      await client.query("COMMIT");
      return NextResponse.json({ received: true });
    }

    // lock payment
    const pRes = await client.query(
      `
      SELECT id, hold_id, status, buyer_name, buyer_email, event_title
      FROM payments
      WHERE provider='fintoc' AND (provider_ref=$1 OR id=$2)
      LIMIT 1
      FOR UPDATE
      `,
      [checkoutSessionId, paymentIdFromMeta]
    );

    if (pRes.rowCount === 0) {
      await client.query("COMMIT");
      return NextResponse.json({ received: true });
    }

    const p = pRes.rows[0];

    if (type === "checkout_session.finished") {
      if (status === "succeeded") {
        await client.query(
          `
          UPDATE payments
          SET status='PAID',
              paid_at = COALESCE(paid_at, NOW()),
              updated_at = NOW()
          WHERE id=$1
          `,
          [String(p.id)]
        );

        await finalizePaidHoldToOrderPgTx(client, {
          holdId: String(p.hold_id || holdIdFromMeta),
          eventTitle: String(p.event_title || ""),
          buyerName: String(p.buyer_name || ""),
          buyerEmail: String(p.buyer_email || ""),
          paymentId: String(p.id),
        });
      } else {
        await client.query(
          `
          UPDATE payments
          SET status = CASE WHEN status='PAID' THEN 'PAID' ELSE 'CANCELLED' END,
              updated_at=NOW()
          WHERE id=$1
          `,
          [String(p.id)]
        );
      }
    }

    if (type === "checkout_session.expired") {
      await client.query(
        `
        UPDATE payments
        SET status = CASE WHEN status='PAID' THEN 'PAID' ELSE 'CANCELLED' END,
            updated_at=NOW()
        WHERE id=$1
        `,
        [String(p.id)]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ received: true });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return new NextResponse(`fintoc webhook error: ${String(e?.message || e)}`, { status: 500 });
  } finally {
    client.release();
  }
}
