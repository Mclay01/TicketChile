// apps/web/src/app/api/payments/stripe/create/route.ts
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { pool } from "@/lib/db";
import { stripe, appBaseUrl } from "@/lib/stripe.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOLD_TTL_MINUTES = 8;

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function parseItems(raw: any) {
  if (!Array.isArray(raw)) return [];
  const out: { ticketTypeId: string; qty: number }[] = [];
  for (const x of raw) {
    const ticketTypeId = pickString(x?.ticketTypeId);
    const qty = Number(x?.qty);
    if (!ticketTypeId) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    out.push({ ticketTypeId, qty: Math.floor(qty) });
  }
  return out;
}

function isOpenSession(s: any) {
  const statusOk = s?.status === "open";
  const urlOk = typeof s?.url === "string" && s.url.length > 0;
  const notExpired =
    typeof s?.expires_at === "number" ? s.expires_at * 1000 > Date.now() : true;
  return statusOk && urlOk && notExpired;
}

async function releaseExpiredHoldsTx(client: any) {
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

function normalizeBaseUrl(u: string) {
  return String(u || "").replace(/\/+$/, "");
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Body inválido (JSON)." });
  }

  // A) pago directo: eventId + items[]
  // B) legado/reintento: holdId
  const holdIdFromBody = pickString(body?.holdId);
  const eventIdFromBody = pickString(body?.eventId);
  const itemsFromBody = parseItems(body?.items);

  const buyerName = pickString(body?.buyerName);
  const buyerEmail = pickString(body?.buyerEmail);

  if (buyerName.length < 2) return json(400, { ok: false, error: "buyerName inválido." });
  if (!buyerEmail.includes("@")) return json(400, { ok: false, error: "buyerEmail inválido." });

  if (!holdIdFromBody) {
    if (!eventIdFromBody) return json(400, { ok: false, error: "Falta eventId." });
    if (itemsFromBody.length === 0) return json(400, { ok: false, error: "Faltan items (cart vacío)." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await releaseExpiredHoldsTx(client);

    let holdId = holdIdFromBody;
    let eventId = eventIdFromBody;

    // 1) Si NO viene holdId => crear hold y “reservar” stock (held)
    if (!holdId) {
      const ids = itemsFromBody.map((x) => x.ticketTypeId);

      const ttRes = await client.query(
        `
        SELECT id, name, price_clp, capacity, sold, held
        FROM ticket_types
        WHERE event_id=$1 AND id = ANY($2::text[])
        FOR UPDATE
        `,
        [eventId, ids]
      );

      if (ttRes.rowCount !== ids.length) {
        return json(409, { ok: false, error: "Algún ticket_type_id no existe para este evento." });
      }

      const byId = new Map<string, any>();
      for (const r of ttRes.rows) byId.set(String(r.id), r);

      for (const it of itemsFromBody) {
        const r = byId.get(it.ticketTypeId);
        const capacity = Number(r.capacity) || 0;
        const sold = Number(r.sold) || 0;
        const held = Number(r.held) || 0;
        const remaining = Math.max(capacity - sold - held, 0);

        if (it.qty > remaining) {
          return json(409, {
            ok: false,
            error: `No hay stock suficiente para "${String(r.name)}". Quedan ${remaining}.`,
          });
        }
      }

      holdId = makeId("hold");

      await client.query(
        `
        INSERT INTO holds (id, event_id, status, created_at, expires_at)
        VALUES ($1, $2, 'ACTIVE', NOW(), NOW() + ($3 || ' minutes')::interval)
        `,
        [holdId, eventId, String(HOLD_TTL_MINUTES)]
      );

      for (const it of itemsFromBody) {
        const r = byId.get(it.ticketTypeId);

        await client.query(
          `
          INSERT INTO hold_items (hold_id, event_id, ticket_type_id, ticket_type_name, unit_price_clp, qty)
          VALUES ($1,$2,$3,$4,$5,$6)
          `,
          [holdId, eventId, it.ticketTypeId, String(r.name), Number(r.price_clp) || 0, it.qty]
        );

        await client.query(
          `
          UPDATE ticket_types
          SET held = held + $1
          WHERE event_id=$2 AND id=$3
          `,
          [it.qty, eventId, it.ticketTypeId]
        );
      }
    }

    // 2) Lock hold
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
    eventId = String(hold.event_id);

    if (hold.status !== "ACTIVE") {
      return json(409, { ok: false, error: `Hold no está activo (${hold.status}).` });
    }

    if (new Date(hold.expires_at).getTime() <= Date.now()) {
      await client.query(`UPDATE holds SET status='EXPIRED' WHERE id=$1`, [holdId]);
      return json(409, { ok: false, error: "Hold expiró." });
    }

    // 3) Items del hold (canónico)
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

    // 4) Event title
    const evRes = await client.query(`SELECT title FROM events WHERE id=$1`, [eventId]);
    const eventTitle = pickString(evRes.rows?.[0]?.title) || `Evento ${eventId}`;

    // 5) line_items + total
    const lineItems = itemsRes.rows.map((r: any) => {
      const name = String(r.ticket_type_name);
      const unit = Math.round(Number(r.unit_price_clp) || 0); // CLP entero
      const qty = Math.floor(Number(r.qty) || 0);
      return { name, unit, qty };
    });

    const amountClp = lineItems.reduce((acc, x) => acc + x.unit * x.qty, 0);
    if (!Number.isFinite(amountClp) || amountClp <= 0) return json(409, { ok: false, error: "Monto inválido." });

    // 6) UPSERT payment (1 pago por hold)
    const newPaymentId = makeId("pay");
    const payRes = await client.query(
      `
      INSERT INTO payments
        (id, hold_id, provider, provider_ref, event_id, event_title, buyer_name, buyer_email, amount_clp, currency, status, created_at, updated_at)
      VALUES
        ($1, $2, 'stripe', NULL, $3, $4, $5, $6, $7, 'CLP', 'CREATED', NOW(), NOW())
      ON CONFLICT (hold_id) DO UPDATE
        SET event_id     = EXCLUDED.event_id,
            event_title  = EXCLUDED.event_title,
            buyer_name   = EXCLUDED.buyer_name,
            buyer_email  = EXCLUDED.buyer_email,
            amount_clp   = EXCLUDED.amount_clp,
            updated_at   = NOW()
      RETURNING *
      `,
      [newPaymentId, holdId, eventId, eventTitle, buyerName, buyerEmail, amountClp]
    );

    const payment = payRes.rows[0];

    if (String(payment.status) === "PAID") {
      await client.query("COMMIT");
      return json(200, { ok: true, status: "PAID", holdId, paymentId: String(payment.id), checkoutUrl: "" });
    }

    // 7) Reusar session si existe y está OPEN
    const existingSessionId = payment.provider_ref ? String(payment.provider_ref) : "";
    if (existingSessionId) {
      try {
        const s = await stripe.checkout.sessions.retrieve(existingSessionId);
        if (isOpenSession(s)) {
          await client.query(`UPDATE payments SET status='PENDING', updated_at=NOW() WHERE id=$1`, [payment.id]);
          await client.query("COMMIT");
          return json(200, {
            ok: true,
            status: "PENDING",
            holdId,
            paymentId: String(payment.id),
            sessionId: existingSessionId,
            checkoutUrl: (s as any).url,
          });
        }
      } catch {
        // si falla retrieve, creamos sesión nueva
      }
    }

    // 8) Crear Checkout Session
    const base = normalizeBaseUrl(appBaseUrl());
    const successUrl = `${base}/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${base}/checkout/${encodeURIComponent(eventId)}?canceled=1`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: buyerEmail,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          holdId,
          paymentId: String(payment.id),
          eventId,
          eventTitle,
          buyerName,
          buyerEmail,
          buyerPhone: pickString(body?.buyerPhone),
          buyerRut: pickString(body?.buyerRut),
          buyerComuna: pickString(body?.buyerComuna),
        },
        line_items: lineItems.map((x) => ({
          quantity: x.qty,
          price_data: {
            currency: "clp",
            unit_amount: x.unit, // CLP 0-decimal
            product_data: { name: `${eventTitle} — ${x.name}` },
          },
        })),
      },
      { idempotencyKey: `hold:${holdId}:payment:${payment.id}` }
    );

    // 9) Guardar session.id + status
    await client.query(
      `
      UPDATE payments
      SET provider_ref=$2, status='PENDING', updated_at=NOW()
      WHERE id=$1
      `,
      [payment.id, session.id]
    );

    await client.query("COMMIT");

    return json(200, {
      ok: true,
      status: "PENDING",
      holdId,
      paymentId: String(payment.id),
      sessionId: session.id,
      checkoutUrl: (session as any).url || "",
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
