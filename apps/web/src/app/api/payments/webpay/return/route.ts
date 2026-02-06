import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import {
  WebpayPlus,
  Options,
  Environment,
  IntegrationApiKeys,
  IntegrationCommerceCodes,
} from "transbank-sdk";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";
import { sendTicketsEmailsForPayment } from "@/lib/tickets.email";

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

async function handleReturn(
  req: Request,
  payload: { tokenWs: string; tbkToken: string; tbkOrder: string }
) {
  const base = baseUrlFromRequest(req);

  const tokenWs = (payload.tokenWs || "").trim();
  const tbkToken = (payload.tbkToken || "").trim();
  const tbkOrder = (payload.tbkOrder || "").trim();

  // Flujos de anulación / abandono (Transbank envía TBK_*)
  if (!tokenWs || tbkToken) {
    if (tbkOrder) {
      const client = await pool.connect();
      try {
        await client.query(
          `
          UPDATE payments
          SET status = CASE WHEN status='PAID' THEN 'PAID' ELSE 'CANCELLED' END,
              updated_at=NOW()
          WHERE id=$1 AND provider='webpay'
          `,
          [tbkOrder]
        );
      } finally {
        client.release();
      }

      const ev = await pool
        .query(`SELECT event_id FROM payments WHERE id=$1`, [tbkOrder])
        .catch(() => null);
      const eventId = ev?.rows?.[0]?.event_id ? String(ev.rows[0].event_id) : "";
      return NextResponse.redirect(
        `${base}/checkout/${encodeURIComponent(eventId || "")}?canceled=1`
      );
    }

    return NextResponse.redirect(`${base}/checkout?canceled=1`);
  }

  // Commit (servidor)
  const tx = new WebpayPlus.Transaction(webpayOptions());
  const resp = await tx.commit(tokenWs);

  const approved = Number((resp as any)?.response_code) === 0;
  const paymentId = String((resp as any)?.buy_order || "").trim();

  if (!paymentId) {
    return new NextResponse("missing buy_order from webpay commit", { status: 500 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const pRes = await client.query(
      `
      SELECT id, hold_id, status, buyer_name, buyer_email, event_title, amount_clp
      FROM payments
      WHERE id=$1 AND provider='webpay'
      FOR UPDATE
      `,
      [paymentId]
    );

    if (pRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return new NextResponse("payment not found", { status: 404 });
    }

    const p = pRes.rows[0];

    if (!approved) {
      await client.query(
        `UPDATE payments SET status='CANCELLED', updated_at=NOW(), provider_ref=COALESCE(provider_ref,$2) WHERE id=$1`,
        [paymentId, tokenWs]
      );
      await client.query("COMMIT");

      const evId = await client.query(`SELECT event_id FROM payments WHERE id=$1`, [paymentId]);
      const eventId = evId.rows?.[0]?.event_id ? String(evId.rows[0].event_id) : "";
      return NextResponse.redirect(`${base}/checkout/${encodeURIComponent(eventId)}?canceled=1`);
    }

    await client.query(
      `
      UPDATE payments
      SET status='PAID',
          provider_ref = COALESCE(provider_ref, $2),
          paid_at = COALESCE(paid_at, NOW()),
          updated_at = NOW()
      WHERE id=$1
      `,
      [paymentId, tokenWs]
    );

    await finalizePaidHoldToOrderPgTx(client, {
      holdId: String(p.hold_id),
      eventTitle: String(p.event_title || ""),
      buyerName: String(p.buyer_name || ""),
      buyerEmail: String(p.buyer_email || ""),
      paymentId: String(p.id),
    });

    await client.query("COMMIT");
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return new NextResponse(`webpay return error: ${String(e?.message || e)}`, { status: 500 });
  } finally {
    client.release();
  }

  // ✅ Enviar correo al buyer y al owner (sin romper checkout si falla el mail)
  try {
    await sendTicketsEmailsForPayment(paymentId, base);
  } catch (e) {
    console.error("ticket email failed:", e);
  }

  // ✅ confirm canónico por payment_id
  return NextResponse.redirect(
    `${base}/checkout/confirm?payment_id=${encodeURIComponent(paymentId)}`
  );
}

// ✅ Webpay puede llegar por POST (normal) o por GET (cuando te redirige con token_ws en query)
export async function POST(req: Request) {
  const fd = await req.formData();
  return handleReturn(req, {
    tokenWs: String(fd.get("token_ws") || ""),
    tbkToken: String(fd.get("TBK_TOKEN") || ""),
    tbkOrder: String(fd.get("TBK_ORDEN_COMPRA") || ""),
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return handleReturn(req, {
    tokenWs: String(searchParams.get("token_ws") || ""),
    tbkToken: String(searchParams.get("TBK_TOKEN") || ""),
    tbkOrder: String(searchParams.get("TBK_ORDEN_COMPRA") || ""),
  });
}
