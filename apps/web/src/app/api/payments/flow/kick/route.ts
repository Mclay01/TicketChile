import { NextRequest, NextResponse } from "next/server";
import { withTx } from "@/lib/db";
import { flowGetStatus } from "@/lib/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOrigin(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    req.headers.get("origin") ||
    "http://localhost:3000"
  );
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function mapFlowStatusToLocal(flowStatus: number) {
  if (flowStatus === 2) return "PAID";
  if (flowStatus === 1) return "PENDING";
  if (flowStatus === 3) return "FAILED";
  if (flowStatus === 4) return "CANCELLED";
  return "PENDING";
}

// ✅ Finaliza igual que tu confirm (misma lógica)
async function finalizePaidPayment(client: any, paymentId: string) {
  const { randomUUID } = await import("node:crypto");

  const p = await client.query(`SELECT * FROM payments WHERE id = $1 FOR UPDATE`, [paymentId]);
  if (p.rowCount === 0) throw new Error("payment_not_found");
  const pay = p.rows[0];

  if (String(pay.status).toUpperCase() === "PAID" && pay.order_id) {
    return { orderId: String(pay.order_id) };
  }

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

  await client.query(`UPDATE holds SET status = 'CONSUMED' WHERE id = $1`, [String(pay.hold_id)]);

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

async function readTokenFromFormOrQuery(req: NextRequest) {
  const fromQuery = pickString(req.nextUrl.searchParams.get("token"));
  if (fromQuery) return fromQuery;

  const ct = req.headers.get("content-type") || "";

  if (req.method === "POST") {
    if (ct.includes("application/x-www-form-urlencoded")) {
      const raw = await req.text();
      const sp = new URLSearchParams(raw);
      return pickString(sp.get("token"));
    }

    try {
      const fd = await req.formData();
      return pickString(fd.get("token"));
    } catch {}

    return "";
  }

  return "";
}

export async function GET(req: NextRequest) {
  // ✅ Modo redirect (cuando Flow vuelve al usuario)
  const origin = getOrigin(req);

  try {
    const token = await readTokenFromFormOrQuery(req);
    if (!token) {
      return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=missing_token`, origin));
    }

    const st = await flowGetStatus(token);
    const paymentId = pickString(st?.commerceOrder);
    if (!paymentId) {
      return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=missing_payment`, origin));
    }

    return NextResponse.redirect(
      new URL(`/checkout/confirm?payment_id=${encodeURIComponent(paymentId)}&flow_token=${encodeURIComponent(token)}`, origin)
    );
  } catch (err: any) {
    return NextResponse.redirect(
      new URL(`/checkout?canceled=1&reason=${encodeURIComponent(err?.message || "flow_error")}`, origin)
    );
  }
}

export async function POST(req: NextRequest) {
  // ✅ Modo “kick real” (usado por tu UI)
  try {
    const ct = req.headers.get("content-type") || "";
    let paymentId = "";
    let token = "";

    if (ct.includes("application/json")) {
      const j = await req.json().catch(() => ({} as any));
      paymentId = pickString(j?.paymentId);
      token = pickString(j?.token);
    } else {
      // fallback form/query
      token = await readTokenFromFormOrQuery(req);
    }

    if (!token) return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });

    const st = await flowGetStatus(token);
    const commerceOrder = pickString(st?.commerceOrder);
    const flowStatus = Number(st?.status || 0);

    // Si no venía paymentId, usa el commerceOrder (que ES tu paymentId)
    if (!paymentId) paymentId = commerceOrder;

    if (!paymentId) return NextResponse.json({ ok: false, error: "missing_payment" }, { status: 400 });

    const localStatus = mapFlowStatusToLocal(flowStatus);

    await withTx(async (c) => {
      await c.query(
        `UPDATE payments
           SET provider_ref = COALESCE(provider_ref, $2),
               status = CASE WHEN status = 'PAID' THEN status ELSE $3 END,
               updated_at = NOW()
         WHERE id = $1`,
        [paymentId, token, localStatus]
      );

      if (localStatus === "PAID") {
        await finalizePaidPayment(c, paymentId);
      }
    });

    return NextResponse.json({ ok: true, paymentId, localStatus }, { status: 200 });
  } catch (err: any) {
    // aquí NO devolvemos redirect; la UI espera JSON
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
