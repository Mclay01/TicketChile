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

function pickStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function lower(v: any) {
  return pickStr(v).toLowerCase();
}

/**
 * ✅ NUEVO: obtén el estado real del pago (payment_intent) cuando exista.
 * En checkout_session.finished, data.status puede ser "finished" (sesión),
 * pero el pago real está en data.payment_resource.payment_intent.status.
 */
function getEffectivePaymentStatus(data: any) {
  const sessionStatus = lower(data?.status);

  const piStatus =
    lower(data?.payment_resource?.payment_intent?.status) ||
    lower(data?.payment_resource?.payment_intent_status) ||
    lower(data?.payment_intent?.status) ||
    ""; // fallback vacío

  // Priorizamos status del payment_intent si existe
  return {
    sessionStatus,
    paymentIntentStatus: piStatus,
    effective: piStatus || sessionStatus,
  };
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
      [pickStr(event?.id)]
    );

    if (dedupe.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ received: true });
    }

    const type = pickStr(event?.type);
    const data = event?.data || {};
    const object = pickStr(data?.object);

    // ids
    const checkoutSessionId = pickStr(data?.id);

    // metadata (tu fallback)
    const meta = data?.metadata || {};
    const paymentIdFromMeta = pickStr(meta?.paymentId);
    const holdIdFromMeta = pickStr(meta?.holdId);

    /**
     * ✅ NUEVO: resolver pago a partir de:
     * - provider_ref = checkoutSessionId (checkout_session)
     * - id = paymentIdFromMeta
     * - hold_id = holdIdFromMeta
     *
     * Esto permite soportar payment_intent.* (asíncrono) si metadata viene propagada.
     */
    async function lockPaymentRow() {
      const pRes = await client.query(
        `
        SELECT id, hold_id, status, buyer_name, buyer_email, event_title
        FROM payments
        WHERE provider='fintoc'
          AND (
            ($1 <> '' AND provider_ref=$1)
            OR ($2 <> '' AND id=$2)
            OR ($3 <> '' AND hold_id=$3)
          )
        LIMIT 1
        FOR UPDATE
        `,
        [checkoutSessionId, paymentIdFromMeta, holdIdFromMeta]
      );

      return pRes.rowCount ? pRes.rows[0] : null;
    }

    // Si no es un evento que nos interese, OK.
    const interesting =
      type === "checkout_session.finished" ||
      type === "checkout_session.expired" ||
      type === "payment_intent.succeeded" ||
      type === "payment_intent.failed";

    if (!interesting) {
      await client.query("COMMIT");
      return NextResponse.json({ received: true });
    }

    // Para checkout_session.* exigimos tener checkoutSessionId
    if ((type.startsWith("checkout_session.") && !checkoutSessionId) || !object) {
      await client.query("COMMIT");
      return NextResponse.json({ received: true });
    }

    const p = await lockPaymentRow();
    if (!p) {
      await client.query("COMMIT");
      return NextResponse.json({ received: true });
    }

    // estados (robusto)
    const { effective, paymentIntentStatus } = getEffectivePaymentStatus(data);

    // Helpers
    async function markPaidAndFinalize() {
      await client.query(
        `
        UPDATE payments
        SET status='PAID',
            paid_at = COALESCE(paid_at, NOW()),
            updated_at = NOW()
        WHERE id=$1
        `,
        [pickStr(p.id)]
      );

      await finalizePaidHoldToOrderPgTx(client, {
        holdId: pickStr(p.hold_id || holdIdFromMeta),
        eventTitle: pickStr(p.event_title || ""),
        buyerName: pickStr(p.buyer_name || ""),
        buyerEmail: pickStr(p.buyer_email || ""),
        paymentId: pickStr(p.id),
      });
    }

    async function markCancelledIfNotPaid() {
      await client.query(
        `
        UPDATE payments
        SET status = CASE WHEN status='PAID' THEN 'PAID' ELSE 'CANCELLED' END,
            updated_at=NOW()
        WHERE id=$1
        `,
        [pickStr(p.id)]
      );
    }

    async function keepPending() {
      await client.query(
        `
        UPDATE payments
        SET status = CASE WHEN status='PAID' THEN 'PAID' ELSE 'PENDING' END,
            updated_at=NOW()
        WHERE id=$1
        `,
        [pickStr(p.id)]
      );
    }

    /**
     * ✅ LÓGICA CORREGIDA:
     * - checkout_session.finished: mira payment_intent.status si viene.
     * - payment_intent.succeeded/failed: actualiza según corresponda (asíncrono).
     */
    if (type === "checkout_session.finished") {
      const pi = paymentIntentStatus; // "succeeded" / "failed" / "requires_action" / ...
      if (pi === "succeeded" || effective === "succeeded") {
        await markPaidAndFinalize();
      } else if (pi === "failed" || effective === "failed") {
        await markCancelledIfNotPaid();
      } else {
        // No rompemos: puede ser asíncrono, dejamos PENDING y esperamos payment_intent.*
        await keepPending();
      }
    }

    if (type === "checkout_session.expired") {
      await markCancelledIfNotPaid();
    }

    if (type === "payment_intent.succeeded") {
      await markPaidAndFinalize();
    }

    if (type === "payment_intent.failed") {
      await markCancelledIfNotPaid();
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
