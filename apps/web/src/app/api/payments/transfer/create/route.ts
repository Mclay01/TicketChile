// apps/web/src/app/api/payments/transfer/create/route.ts
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { pool } from "@/lib/db";

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

function isEmailLike(s: string) {
  const v = s.trim();
  return v.length >= 3 && v.includes("@") && v.includes(".");
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function releaseExpiredHoldsTx(client: any) {
  // Expira holds activos vencidos y libera "held" en ticket_types
  const expired = await client.query(`
    WITH expired AS (
      UPDATE holds
      SET status='EXPIRED'
      WHERE status='ACTIVE' AND expires_at <= NOW()
      RETURNING id
    )
    SELECT id FROM expired
  `);

  const ids: string[] = expired.rows.map((r: any) => r.id);
  if (ids.length === 0) return;

  await client.query(
    `
    UPDATE ticket_types tt
    SET held = GREATEST(0, tt.held - x.qty)
    FROM (
      SELECT hi.event_id, hi.ticket_type_id, SUM(hi.qty)::int AS qty
      FROM hold_items hi
      WHERE hi.hold_id = ANY($1::text[])
      GROUP BY hi.event_id, hi.ticket_type_id
    ) x
    WHERE tt.event_id = x.event_id AND tt.id = x.ticket_type_id
    `,
    [ids]
  );
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Body inválido (JSON)." });
  }

  // El UI debería mandar esto igual que Stripe:
  const holdId = pickString(body?.holdId);
  const buyerName = pickString(body?.buyerName);
  const buyerEmail = pickString(body?.buyerEmail);

  if (!holdId) return json(400, { ok: false, error: "Falta holdId." });
  if (buyerName.length < 2) return json(400, { ok: false, error: "buyerName inválido." });
  if (!isEmailLike(buyerEmail)) return json(400, { ok: false, error: "buyerEmail inválido." });

  // Datos bancarios (ponlos en .env.local idealmente)
  const bank = {
    bankName: process.env.TRANSFER_BANK_NAME || "Banco de Chile",
    accountName: process.env.TRANSFER_ACCOUNT_NAME || "Ticketchile SpA",
    accountRut: process.env.TRANSFER_ACCOUNT_RUT || "12.345.678-9",
    accountType: process.env.TRANSFER_ACCOUNT_TYPE || "Cuenta Corriente",
    accountNumber: process.env.TRANSFER_ACCOUNT_NUMBER || "123456789",
    accountEmail: process.env.TRANSFER_ACCOUNT_EMAIL || "pagos@ticketchile.cl",
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await releaseExpiredHoldsTx(client);

    // 1) Lock hold
    const hRes = await client.query(
      `
      SELECT id, event_id, status, expires_at
      FROM holds
      WHERE id=$1
      FOR UPDATE
      `,
      [holdId]
    );

    if (hRes.rowCount === 0) return json(404, { ok: false, error: "Hold no existe." });

    const hold = hRes.rows[0];

    if (hold.status !== "ACTIVE") {
      return json(409, { ok: false, error: `Hold no está activo (${hold.status}).` });
    }

    if (new Date(hold.expires_at).getTime() <= Date.now()) {
      await client.query(`UPDATE holds SET status='EXPIRED' WHERE id=$1`, [holdId]);
      return json(409, { ok: false, error: "Hold expiró." });
    }

    // 2) Items (monto canónico)
    const itemsRes = await client.query(
      `
      SELECT ticket_type_name, unit_price_clp, qty
      FROM hold_items
      WHERE hold_id=$1
      ORDER BY ticket_type_name ASC
      `,
      [holdId]
    );

    if (itemsRes.rowCount === 0) return json(409, { ok: false, error: "Hold no tiene items." });

    const lineItems = itemsRes.rows.map((r: any) => ({
      name: String(r.ticket_type_name),
      unit: Number(r.unit_price_clp) || 0,
      qty: Number(r.qty) || 0,
    }));

    const amountClp = lineItems.reduce((acc, x) => acc + x.unit * x.qty, 0);
    if (!Number.isFinite(amountClp) || amountClp <= 0) {
      return json(409, { ok: false, error: "Monto inválido." });
    }

    // 3) Event title
    const evRes = await client.query(`SELECT title FROM events WHERE id=$1`, [String(hold.event_id)]);
    const eventTitle = pickString(evRes.rows?.[0]?.title) || `Evento ${String(hold.event_id)}`;

    // 4) UPSERT payment por hold
    const paymentId = makeId("pay");
    const payRes = await client.query(
      `
      INSERT INTO payments
        (id, hold_id, provider, provider_ref, event_id, event_title, buyer_name, buyer_email, amount_clp, currency, status, created_at, updated_at)
      VALUES
        ($1, $2, 'transfer', NULL, $3, $4, $5, $6, $7, 'CLP', 'PENDING', NOW(), NOW())
      ON CONFLICT (hold_id) DO UPDATE
        SET provider    = 'transfer',
            event_id     = EXCLUDED.event_id,
            event_title  = EXCLUDED.event_title,
            buyer_name   = EXCLUDED.buyer_name,
            buyer_email  = EXCLUDED.buyer_email,
            amount_clp   = EXCLUDED.amount_clp,
            updated_at   = NOW()
      RETURNING *
      `,
      [paymentId, holdId, String(hold.event_id), eventTitle, buyerName, buyerEmail, amountClp]
    );

    const payment = payRes.rows[0];

    // Referencia para que el usuario la ponga en la transferencia
    const reference = `TC-${String(payment.id).slice(-6).toUpperCase()}`;

    await client.query("COMMIT");

    return json(200, {
      ok: true,
      status: String(payment.status || "PENDING"),
      holdId,
      paymentId: String(payment.id),
      amountClp,
      currency: "CLP",
      reference,
      bank,
      note: "Usa la referencia EXACTA en el comentario de la transferencia.",
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
