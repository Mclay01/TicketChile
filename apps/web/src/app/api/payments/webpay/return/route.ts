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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeBaseUrl(u: string) {
  return String(u || "").replace(/\/+$/, "");
}

// Base URL robusta (prod/local) sin depender de Stripe
function baseUrlFromRequest(req: Request) {
  // 1) Si defines APP_BASE_URL en prod, esto manda.
  const envBase = normalizeBaseUrl(String(process.env.APP_BASE_URL || "").trim());
  if (envBase) return envBase;

  // 2) Preferir headers proxy (Vercel / reverse proxy)
  const xfProto = (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim();
  const xfHost = (req.headers.get("x-forwarded-host") || "").split(",")[0].trim();
  const host = xfHost || req.headers.get("host") || "";

  if (host) {
    const proto = xfProto || "https";
    return normalizeBaseUrl(`${proto}://${host}`);
  }

  // 3) Fallback: URL del request
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

  // Integración: usa defaults oficiales del SDK si no defines env vars
  return new Options(
    process.env.WEBPAY_COMMERCE_CODE || IntegrationCommerceCodes.WEBPAY_PLUS,
    process.env.WEBPAY_API_KEY || IntegrationApiKeys.WEBPAY,
    env
  );
}

async function readWebpayParams(req: Request) {
  const url = new URL(req.url);

  // 1) Querystring (tu caso actual: ?token_ws=...)
  let tokenWs = String(url.searchParams.get("token_ws") || "").trim();
  let tbkToken = String(url.searchParams.get("TBK_TOKEN") || "").trim();
  let tbkOrder = String(url.searchParams.get("TBK_ORDEN_COMPRA") || "").trim();

  // 2) FormData (Transbank también puede postear)
  if (req.method === "POST") {
    try {
      const fd = await req.formData();
      tokenWs = tokenWs || String(fd.get("token_ws") || "").trim();
      tbkToken = tbkToken || String(fd.get("TBK_TOKEN") || "").trim();
      tbkOrder = tbkOrder || String(fd.get("TBK_ORDEN_COMPRA") || "").trim();
    } catch {
      // nada: si no hay form-data, seguimos con querystring
    }
  }

  return { tokenWs, tbkToken, tbkOrder };
}

async function handler(req: Request) {
  const base = baseUrlFromRequest(req);
  const { tokenWs, tbkToken, tbkOrder } = await readWebpayParams(req);

  // Flujos de anulación / abandono (Transbank envía TBK_*)
  // Si no viene token_ws o viene TBK_TOKEN => cancelado
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
        `${base}/checkout/${encodeURIComponent(eventId || "")}?canceled=1`,
        303
      );
    }

    return NextResponse.redirect(`${base}/checkout?canceled=1`, 303);
  }

  // Commit (servidor)
  const tx = new WebpayPlus.Transaction(webpayOptions());

  let resp: any;
  try {
    resp = await tx.commit(tokenWs);
  } catch (e: any) {
    return new NextResponse(`webpay commit error: ${String(e?.message || e)}`, { status: 500 });
  }

  // resp.response_code === 0 => aprobado
  const approved = Number(resp?.response_code) === 0;
  const paymentId = String(resp?.buy_order || "").trim();

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
        `UPDATE payments
         SET status='CANCELLED', updated_at=NOW(), provider_ref=COALESCE(provider_ref,$2)
         WHERE id=$1`,
        [paymentId, tokenWs]
      );
      await client.query("COMMIT");

      const evId = await client.query(`SELECT event_id FROM payments WHERE id=$1`, [paymentId]);
      const eventId = evId.rows?.[0]?.event_id ? String(evId.rows[0].event_id) : "";
      return NextResponse.redirect(
        `${base}/checkout/${encodeURIComponent(eventId)}?canceled=1`,
        303
      );
    }

    // aprobado
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

    // Finalizar hold -> order + tickets (idempotente)
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

  // Confirm en UI canónica por payment_id
  return NextResponse.redirect(
    `${base}/checkout/confirm?payment_id=${encodeURIComponent(paymentId)}`,
    303
  );
}

// ✅ CLAVE: Transbank te está llamando por GET con token_ws en query
export async function GET(req: Request) {
  return handler(req);
}

export async function POST(req: Request) {
  return handler(req);
}
