import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import { flowCreatePayment } from "@/lib/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOLD_TTL_MINUTES = 15;

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

export async function POST(req: NextRequest) {
  const reqId = `flow_create_${Math.random().toString(16).slice(2, 10)}`;

  try {
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

    console.log("[flow:create][in]", {
      reqId,
      eventId: !!eventId,
      buyerNameLen: buyerName.length,
      buyerEmail: buyerEmail ? buyerEmail.replace(/(^.).+(@.*$)/, "$1***$2") : "",
      itemsCount: normalizedItems.length,
    });

    if (!eventId) return NextResponse.json({ ok: false, error: "eventId_missing" }, { status: 400 });
    if (!buyerName || buyerName.length < 2)
      return NextResponse.json({ ok: false, error: "buyerName_invalid" }, { status: 400 });
    if (!buyerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail))
      return NextResponse.json({ ok: false, error: "buyerEmail_invalid" }, { status: 400 });
    if (normalizedItems.length === 0)
      return NextResponse.json({ ok: false, error: "items_empty" }, { status: 400 });

    const amountFromClient = parseCLPAmount(body?.amount);

    let paymentId = "";
    let holdId = "";
    let total = 0;
    let eventTitle = "";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Event title
      const ev = await client.query(`SELECT id, title FROM events WHERE id=$1`, [eventId]);
      if (ev.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "event_not_found" }, { status: 404 });
      }
      eventTitle = String(ev.rows[0].title || "");

      // Ticket types
      const ids = normalizedItems.map((x: any) => x.ticketTypeId);
      const tt = await client.query(
        `SELECT id, name, price_clp, capacity, sold, held
           FROM ticket_types
          WHERE event_id=$1 AND id = ANY($2::text[])`,
        [eventId, ids]
      );

      if (tt.rowCount !== ids.length) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "ticket_type_not_found" }, { status: 400 });
      }

      const byId = new Map<string, any>();
      for (const row of tt.rows) byId.set(String(row.id), row);

      // total server-side
      total = 0;
      for (const it of normalizedItems) {
        const row = byId.get(it.ticketTypeId);
        total += Number(row.price_clp) * it.qty;
      }

      if (!Number.isFinite(total) || total <= 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "amount_invalid" }, { status: 400 });
      }

      // anti-manipulación
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

      // Reservar (held)
      for (const it of normalizedItems) {
        const u = await client.query(
          `UPDATE ticket_types
              SET held = held + $3
            WHERE event_id=$1
              AND id=$2
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

      // Payment (CREATED)
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
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }

    // Flow (afuera de la TX)
    const origin = getOrigin(req);

    const urlConfirmation = `${origin}/api/payments/flow/webhook`; // tu webhook
    const urlReturn = `${origin}/api/payments/flow/kick`; // tu retorno

    let flowToken = "";
    try {
      const flow = await flowCreatePayment({
        commerceOrder: paymentId, // Flow devolverá esto en getStatus
        subject: `Compra tickets - ${eventTitle || paymentId}`,
        amount: total, // ✅ total real (no client)
        email: buyerEmail,
        urlReturn,
        urlConfirmation,
        timeoutSeconds: HOLD_TTL_MINUTES * 60,
        optional: { eventId, holdId, paymentId },
      });

      flowToken = flow.token;

      // Guardar token + status=PENDING
      const c2 = await pool.connect();
      try {
        await c2.query(
          `UPDATE payments
              SET provider_ref=$2, status='PENDING', updated_at=NOW()
            WHERE id=$1`,
          [paymentId, flowToken]
        );
      } finally {
        c2.release();
      }

      const checkoutUrl = `${flow.url}?token=${encodeURIComponent(flow.token)}`;

      console.log("[flow:create][ok]", { reqId, paymentId, holdId, total, checkout: true });

      return NextResponse.json({
        ok: true,
        provider: "flow",
        paymentId,
        checkoutUrl,
        token: flow.token, // útil para debug
      });
    } catch (err: any) {
      console.log("[flow:create][fail]", { reqId, paymentId, holdId, err: String(err?.message || err) });

      // Cleanup: marcar FAILED + liberar held
      const c = await pool.connect();
      try {
        await c.query("BEGIN");

        await c.query(
          `UPDATE payments SET status='FAILED', updated_at=NOW() WHERE id=$1`,
          [paymentId]
        );

        const hi = await c.query(`SELECT ticket_type_id, qty FROM hold_items WHERE hold_id=$1`, [holdId]);
        for (const row of hi.rows) {
          await c.query(
            `UPDATE ticket_types
                SET held = GREATEST(held - $3, 0)
              WHERE event_id=$1 AND id=$2`,
            [eventId, String(row.ticket_type_id), Number(row.qty)]
          );
        }

        await c.query(`UPDATE holds SET status='EXPIRED' WHERE id=$1`, [holdId]);

        await c.query("COMMIT");
      } catch {
        try {
          await c.query("ROLLBACK");
        } catch {}
      } finally {
        c.release();
      }

      return NextResponse.json(
        { ok: false, provider: "flow", error: err?.message || "flow_error" },
        { status: 502 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
