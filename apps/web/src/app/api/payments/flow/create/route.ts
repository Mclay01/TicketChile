import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { createHmac, randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FLOW_API_BASE = "https://api.flow.cl";
const HOLD_TTL_MINUTES = 15;

declare global {
  // eslint-disable-next-line no-var
  var __pgPoolFlow: Pool | undefined;
}

function getDbPool() {
  if (global.__pgPoolFlow) return global.__pgPoolFlow;

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL (or POSTGRES_URL).");

  global.__pgPoolFlow = new Pool({ connectionString });
  return global.__pgPoolFlow;
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function parseCLPAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n > 0 ? n : null;
  }
  if (typeof value === "string") {
    const digits = value.replace(/[^\d]/g, "");
    if (!digits) return null;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function getOrigin(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    req.headers.get("origin") ||
    "http://localhost:3000"
  );
}

/**
 * Flow signature:
 * - sort keys
 * - concat key + value (SIN &)
 * - HMAC-SHA256 hex con secretKey
 */
function flowSign(params: Record<string, string>, secretKey: string) {
  const keys = Object.keys(params).sort();
  let toSign = "";
  for (const k of keys) toSign += k + params[k];
  return createHmac("sha256", secretKey).update(toSign).digest("hex");
}

async function flowCreatePayment(params: {
  apiKey: string;
  secretKey: string;
  commerceOrder: string;
  subject: string;
  amount: number;
  payerEmail: string;
  urlConfirmation: string;
  urlReturn: string;
  optional?: any;
}) {
  const base: Record<string, string> = {
    apiKey: params.apiKey,
    commerceOrder: params.commerceOrder,
    subject: params.subject,
    currency: "CLP",
    amount: String(params.amount),
    email: params.payerEmail,
    urlConfirmation: params.urlConfirmation,
    urlReturn: params.urlReturn,
  };

  if (params.optional && typeof params.optional === "object") {
    base.optional = JSON.stringify(params.optional);
  }

  const s = flowSign(base, params.secretKey);
  const body = new URLSearchParams({ ...base, s });

  const r = await fetch(`${FLOW_API_BASE}/payment/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const j = await r.json().catch(() => null);

  if (!r.ok) {
    return {
      ok: false as const,
      status: r.status,
      error: j?.message || j?.error || j || "flow_error",
      raw: j,
    };
  }

  const token = String(j?.token || "");
  const url = String(j?.url || "");

  if (!token || !url) {
    return { ok: false as const, status: 500, error: "flow_invalid_response", raw: j };
  }

  const checkoutUrl = `${url}?token=${encodeURIComponent(token)}`;
  return { ok: true as const, token, url, checkoutUrl, raw: j };
}

export async function POST(req: NextRequest) {
  const reqId = `flow_create_${randomUUID().slice(0, 8)}`;

  try {
    const FLOW_API_KEY = mustEnv("FLOW_API_KEY");
    const FLOW_SECRET_KEY = mustEnv("FLOW_SECRET_KEY");

    const pool = getDbPool();
    const body = await req.json().catch(() => ({} as any));

    const eventId = pickString(body?.eventId);
    const buyerName = pickString(body?.buyerName);
    const buyerEmail = pickString(body?.buyerEmail).toLowerCase();

    const items = Array.isArray(body?.items) ? body.items : [];
    const normalizedItems = items
      .map((x: any) => ({
        ticketTypeId: pickString(x?.ticketTypeId),
        qty: Math.floor(Number(x?.qty)),
      }))
      .filter((x: any) => x.ticketTypeId && Number.isFinite(x.qty) && x.qty > 0);

    // ✅ LOG siempre (sin datos sensibles)
    console.log("[flow:create][in]", {
      reqId,
      eventId: !!eventId,
      buyerNameLen: buyerName?.length || 0,
      buyerEmail: buyerEmail ? buyerEmail.replace(/(.{2}).+(@.+)/, "$1***$2") : "",
      itemsCount: normalizedItems.length,
    });

    if (!eventId) {
      return NextResponse.json({ ok: false, error: "eventId_missing" }, { status: 400 });
    }
    if (!buyerName || buyerName.length < 2) {
      return NextResponse.json({ ok: false, error: "buyerName_invalid" }, { status: 400 });
    }
    if (!buyerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
      return NextResponse.json({ ok: false, error: "buyerEmail_invalid" }, { status: 400 });
    }
    if (normalizedItems.length === 0) {
      return NextResponse.json({ ok: false, error: "items_empty" }, { status: 400 });
    }

    const amountFromClient = parseCLPAmount(body?.amount);

    const client = await pool.connect();
    let paymentId = "";
    let holdId = "";

    let total = 0;
    let eventTitle = "";

    try {
      await client.query("BEGIN");

      // Event title
      const ev = await client.query(`SELECT id, title FROM events WHERE id = $1`, [eventId]);
      if (ev.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "event_not_found" }, { status: 404 });
      }
      eventTitle = String(ev.rows[0].title);

      // Ticket types
      const ids = normalizedItems.map((x: any) => x.ticketTypeId);
      const tt = await client.query(
        `SELECT id, name, price_clp, capacity, sold, held
         FROM ticket_types
         WHERE event_id = $1 AND id = ANY($2::text[])`,
        [eventId, ids]
      );

      if (tt.rowCount !== ids.length) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "ticket_type_not_found" }, { status: 400 });
      }

      const byId = new Map<string, any>();
      for (const row of tt.rows) byId.set(String(row.id), row);

      // Recalcular total server-side
      total = 0;
      for (const it of normalizedItems) {
        const row = byId.get(it.ticketTypeId);
        total += Number(row.price_clp) * it.qty;
      }

      if (!Number.isFinite(total) || total <= 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "amount_invalid" }, { status: 400 });
      }

      // Si viene amount del client y no calza, lo frenamos (evita manipulación)
      if (amountFromClient && amountFromClient !== total) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { ok: false, error: "amount_mismatch", detail: `server=${total} client=${amountFromClient}` },
          { status: 400 }
        );
      }

      // Hold
      holdId = `hold_${randomUUID()}`;
      const expiresAt = new Date(Date.now() + HOLD_TTL_MINUTES * 60_000).toISOString();

      await client.query(
        `INSERT INTO holds (id, event_id, status, expires_at)
         VALUES ($1, $2, 'ACTIVE', $3)`,
        [holdId, eventId, expiresAt]
      );

      // Reservar (held) con condición de capacidad
      for (const it of normalizedItems) {
        const u = await client.query(
          `UPDATE ticket_types
             SET held = held + $3
           WHERE event_id = $1
             AND id = $2
             AND (sold + held + $3) <= capacity
           RETURNING id`,
          [eventId, it.ticketTypeId, it.qty]
        );
        if (u.rowCount === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ ok: false, error: "capacity_exceeded" }, { status: 409 });
        }

        const row = byId.get(it.ticketTypeId);
        await client.query(
          `INSERT INTO hold_items
            (hold_id, event_id, ticket_type_id, ticket_type_name, unit_price_clp, qty)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [holdId, eventId, it.ticketTypeId, String(row.name), Number(row.price_clp), it.qty]
        );
      }

      // Payment
      paymentId = `pay_${randomUUID()}`;
      await client.query(
        `INSERT INTO payments
          (id, hold_id, provider, provider_ref, event_id, event_title,
           buyer_name, buyer_email, owner_email,
           amount_clp, currency, status)
         VALUES
          ($1, $2, 'flow', NULL, $3, $4,
           $5, $6, $7,
           $8, 'CLP', 'CREATED')`,
        [paymentId, holdId, eventId, eventTitle, buyerName, buyerEmail, buyerEmail, total]
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    // ✅ Llamada a Flow (afuera de la TX DB) con el TOTAL REAL (no el body.amount)
    const origin = getOrigin(req);

    const urlConfirmation = `${origin}/api/payments/flow/confirm`;
    const urlReturn = `${origin}/api/payments/flow/kick`;

    console.log("[flow:create][flow_call]", { reqId, paymentId, holdId, total, origin });

    const flowRes = await flowCreatePayment({
      apiKey: FLOW_API_KEY,
      secretKey: FLOW_SECRET_KEY,
      commerceOrder: paymentId, // clave
      subject: `Compra tickets - ${eventTitle}`,
      amount: total, // ✅ SIEMPRE el server total
      payerEmail: buyerEmail,
      urlConfirmation,
      urlReturn,
      optional: { eventId, holdId, paymentId },
    });

    if (!flowRes.ok) {
      console.error("[flow:create][flow_error]", { reqId, paymentId, holdId, status: flowRes.status, error: flowRes.error });

      // Cleanup suave: marcar FAILED y liberar held
      const pool = getDbPool();
      const c = await pool.connect();
      try {
        await c.query("BEGIN");

        await c.query(`UPDATE payments SET status='FAILED', updated_at=NOW() WHERE id=$1`, [paymentId]);

        const hi = await c.query(`SELECT ticket_type_id, qty FROM hold_items WHERE hold_id = $1`, [holdId]);
        for (const row of hi.rows) {
          await c.query(
            `UPDATE ticket_types
               SET held = GREATEST(held - $3, 0)
             WHERE event_id = $1 AND id = $2`,
            [eventId, String(row.ticket_type_id), Number(row.qty)]
          );
        }

        await c.query(`UPDATE holds SET status='EXPIRED' WHERE id = $1`, [holdId]);
        await c.query("COMMIT");
      } catch (e) {
        try { await c.query("ROLLBACK"); } catch {}
      } finally {
        c.release();
      }

      return NextResponse.json(
        { ok: false, provider: "flow", status: flowRes.status, error: flowRes.error },
        { status: 502 }
      );
    }

    // Guardar token en DB + pasar URL al cliente
    const pool2 = getDbPool();
    const c2 = await pool2.connect();
    try {
      await c2.query(
        `UPDATE payments
           SET provider_ref = $2, status = 'PENDING', updated_at = NOW()
         WHERE id = $1`,
        [paymentId, flowRes.token]
      );
    } finally {
      c2.release();
    }

    console.log("[flow:create][ok]", { reqId, paymentId, holdId, total });

    return NextResponse.json({
      ok: true,
      provider: "flow",
      paymentId,
      checkoutUrl: flowRes.checkoutUrl,
    });
  } catch (err: any) {
    console.error("[flow:create][fatal]", { detail: err?.message ?? String(err) });
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
