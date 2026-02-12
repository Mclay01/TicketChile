import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { createHmac, randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FLOW_API_BASE = "https://api.flow.cl";

declare global {
  // eslint-disable-next-line no-var
  var __pgPoolFlow2: Pool | undefined;
}

function getDbPool() {
  if (global.__pgPoolFlow2) return global.__pgPoolFlow2;

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL (or POSTGRES_URL).");

  global.__pgPoolFlow2 = new Pool({ connectionString });
  return global.__pgPoolFlow2;
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function flowSign(params: Record<string, string>, secretKey: string) {
  const keys = Object.keys(params).sort();
  let toSign = "";
  for (const k of keys) toSign += k + params[k];
  return createHmac("sha256", secretKey).update(toSign).digest("hex");
}

async function flowGetStatus(token: string, apiKey: string, secretKey: string) {
  const base = { apiKey, token };
  const s = flowSign(base, secretKey);
  const qs = new URLSearchParams({ ...base, s });
  const r = await fetch(`${FLOW_API_BASE}/payment/getStatus?${qs.toString()}`, { method: "GET" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message || j?.error || `Flow getStatus HTTP ${r.status}`);
  return j as any;
}

function mapFlowStatusToLocal(flowStatus: number) {
  // Flow: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada
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
  try {
    const FLOW_API_KEY = mustEnv("FLOW_API_KEY");
    const FLOW_SECRET_KEY = mustEnv("FLOW_SECRET_KEY");

    // Flow manda x-www-form-urlencoded con token
    const raw = await req.text();
    const sp = new URLSearchParams(raw);
    const token = (sp.get("token") || "").trim();

    if (!token) {
      return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
    }

    const pool = getDbPool();
    const client = await pool.connect();

    try {
      // Dedupe de webhook (si llega repetido)
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO webhook_events (provider, event_id)
         VALUES ('flow', $1)
         ON CONFLICT DO NOTHING`,
        [token]
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    // Consultar estado en Flow
    const st = await flowGetStatus(token, FLOW_API_KEY, FLOW_SECRET_KEY);
    const paymentId = String(st?.commerceOrder || "").trim();
    const flowStatus = Number(st?.status);

    if (!paymentId) {
      // Igual respondemos 200 para que Flow no te reintente infinito
      return new NextResponse("OK", { status: 200 });
    }

    const localStatus = mapFlowStatusToLocal(flowStatus);

    const c2 = await pool.connect();
    try {
      await c2.query("BEGIN");

      // Update payment básico (por id o por token)
      await c2.query(
        `UPDATE payments
           SET provider_ref = COALESCE(provider_ref, $2),
               status = CASE
                 WHEN status = 'PAID' THEN status
                 ELSE $3
               END,
               updated_at = NOW()
         WHERE id = $1`,
        [paymentId, token, localStatus]
      );

      if (localStatus === "PAID") {
        await finalizePaidPayment(c2, paymentId);
      }

      await c2.query("COMMIT");
    } catch (e) {
      await c2.query("ROLLBACK");
      throw e;
    } finally {
      c2.release();
    }

    // Flow espera 200 rápido
    return new NextResponse("OK", { status: 200 });
  } catch (err: any) {
    // Importante: igual 200 para evitar reintentos brutales si ya procesaste parcialmente.
    console.error("[flow:confirm] error", err?.message || err);
    return new NextResponse("OK", { status: 200 });
  }
}
