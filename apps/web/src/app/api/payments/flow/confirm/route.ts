// apps/web/src/app/api/payments/flow/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomUUID } from "node:crypto";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Flow usa recursos tipo /payment/getStatus (base típica: https://www.flow.cl/api) :contentReference[oaicite:0]{index=0}
const FLOW_BASE_URL = process.env.FLOW_BASE_URL || "https://www.flow.cl/api";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// Firma Flow: ordenar keys, concatenar key+value, HMAC-SHA256 :contentReference[oaicite:1]{index=1}
function flowSign(params: Record<string, string>, secretKey: string) {
  const keys = Object.keys(params).sort();
  let toSign = "";
  for (const k of keys) toSign += k + params[k];
  return createHmac("sha256", secretKey).update(toSign).digest("hex");
}

async function flowGetStatus(token: string, apiKey: string, secretKey: string) {
  const base = { apiKey, token };
  const s = flowSign(base, secretKey);

  const url = new URL(`${FLOW_BASE_URL}/payment/getStatus`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("token", token);
  url.searchParams.set("s", s);

  const r = await fetch(url.toString(), { method: "GET" });
  const text = await r.text();

  let j: any = null;
  try {
    j = JSON.parse(text);
  } catch {}

  if (!r.ok) {
    throw new Error(j?.message || j?.error || `Flow getStatus HTTP ${r.status} | ${text}`);
  }
  return j as any;
}

// Flow status: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada :contentReference[oaicite:2]{index=2}
function mapFlowStatusToLocal(flowStatus: number) {
  if (flowStatus === 2) return "PAID";
  if (flowStatus === 1) return "PENDING";
  if (flowStatus === 3) return "FAILED";
  if (flowStatus === 4) return "CANCELLED";
  return "PENDING";
}

async function finalizePaidPayment(client: any, paymentId: string) {
  // Lock payment
  const p = await client.query(`SELECT * FROM payments WHERE id = $1 FOR UPDATE`, [paymentId]);
  if (p.rowCount === 0) throw new Error("payment_not_found");
  const pay = p.rows[0];

  // Idempotencia: si ya está PAID y tiene order_id, no duplicamos nada
  if (String(pay.status).toUpperCase() === "PAID" && pay.order_id) {
    return { orderId: String(pay.order_id) };
  }

  // Hold + items
  const h = await client.query(`SELECT id, status FROM holds WHERE id = $1 FOR UPDATE`, [String(pay.hold_id)]);
  if (h.rowCount === 0) throw new Error("hold_not_found");

  const items = await client.query(
    `SELECT ticket_type_id, ticket_type_name, unit_price_clp, qty
     FROM hold_items
     WHERE hold_id = $1`,
    [String(pay.hold_id)]
  );
  if (items.rowCount === 0) throw new Error("hold_items_empty");

  const orderId = `ord_${randomUUID()}`;

  // Order
  await client.query(
    `INSERT INTO orders (id, hold_id, event_id, event_title, buyer_name, buyer_email, owner_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      orderId,
      String(pay.hold_id),
      String(pay.event_id),
      String(pay.event_title),
      String(pay.buyer_name),
      String(pay.buyer_email),
      String(pay.owner_email),
    ]
  );

  // Tickets
  for (const row of items.rows) {
    const qty = Number(row.qty);
    for (let i = 0; i < qty; i++) {
      const ticketId = `tkt_${randomUUID()}`;
      await client.query(
        `INSERT INTO tickets
          (id, order_id, event_id, ticket_type_id, ticket_type_name, buyer_email, owner_email, status)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,'VALID')`,
        [
          ticketId,
          orderId,
          String(pay.event_id),
          String(row.ticket_type_id),
          String(row.ticket_type_name),
          String(pay.buyer_email),
          String(pay.owner_email),
        ]
      );
    }

    // Mover held -> sold
    const u = await client.query(
      `UPDATE ticket_types
         SET sold = sold + $3,
             held = held - $3
       WHERE event_id = $1
         AND id = $2
         AND held >= $3
       RETURNING id`,
      [String(pay.event_id), String(row.ticket_type_id), qty]
    );
    if (u.rowCount === 0) throw new Error("ticket_types_update_failed");
  }

  // Hold consumed
  await client.query(`UPDATE holds SET status = 'CONSUMED' WHERE id = $1`, [String(pay.hold_id)]);

  // Payment PAID
  await client.query(
    `UPDATE payments
       SET status = 'PAID',
           paid_at = COALESCE(paid_at, NOW()),
           updated_at = NOW(),
           order_id = $2
     WHERE id = $1`,
    [paymentId, orderId]
  );

  return { orderId };
}

export async function POST(req: NextRequest) {
  const reqId = `flow_confirm_${randomUUID().slice(0, 8)}`;

  try {
    const FLOW_API_KEY = mustEnv("FLOW_API_KEY");
    const FLOW_SECRET_KEY = mustEnv("FLOW_SECRET_KEY");

    // Flow manda x-www-form-urlencoded con "token" en body :contentReference[oaicite:3]{index=3}
    const raw = await req.text();
    const sp = new URLSearchParams(raw);
    const token = (sp.get("token") || "").trim();

    // Flow pide 200 sí o sí (y rápido) :contentReference[oaicite:4]{index=4}
    if (!token) return new NextResponse("OK", { status: 200 });

    // (Opcional) registrar evento recibido, pero NO bloqueamos el flujo si llega repetido
    try {
      const c0 = await pool.connect();
      try {
        await c0.query(
          `INSERT INTO webhook_events (provider, event_id)
           VALUES ('flow', $1)
           ON CONFLICT DO NOTHING`,
          [token]
        );
      } finally {
        c0.release();
      }
    } catch (e: any) {
      console.error("[flow:confirm][webhook_events]", reqId, e?.message ?? e);
    }

    // Consultar estado en Flow
    const st = await flowGetStatus(token, FLOW_API_KEY, FLOW_SECRET_KEY);
    const paymentId = String(st?.commerceOrder || "").trim();
    const flowStatus = Number(st?.status);

    if (!paymentId) return new NextResponse("OK", { status: 200 });

    const localStatus = mapFlowStatusToLocal(flowStatus);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const upd = await client.query(
        `UPDATE payments
           SET provider_ref = COALESCE(provider_ref, $2),
               status = CASE
                 WHEN status = 'PAID' THEN status
                 ELSE $3
               END,
               updated_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [paymentId, token, localStatus]
      );

      // Si no existe el payment en tu DB, no hacemos nada (pero devolvemos 200)
      if (upd.rowCount === 0) {
        await client.query("COMMIT");
        return new NextResponse("OK", { status: 200 });
      }

      if (localStatus === "PAID") {
        await finalizePaidPayment(client, paymentId);
      }

      await client.query("COMMIT");
    } catch (e: any) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      console.error("[flow:confirm][tx-error]", reqId, e?.message ?? e);
    } finally {
      client.release();
    }

    return new NextResponse("OK", { status: 200 });
  } catch (err: any) {
    console.error("[flow:confirm][err]", reqId, err?.message ?? err);
    return new NextResponse("OK", { status: 200 });
  }
}
