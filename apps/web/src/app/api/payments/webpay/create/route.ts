import type { PoolClient } from "pg";
import { paymentCreator } from "@/lib/payment-create-access.server";
import { accessResponse } from "@/lib/access.server";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { pool } from "@/lib/db";
import { appBaseUrl } from "@/lib/stripe.server";
import {
  WebpayPlus,
  Options,
  Environment,
  IntegrationApiKeys,
  IntegrationCommerceCodes,
} from "transbank-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOLD_TTL_MINUTES = 8;

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function pickString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function parseItems(raw: unknown) {
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

async function releaseExpiredHoldsTx(client: PoolClient) {
  const expired = await client.query(`
    WITH expired AS (
      UPDATE holds
      SET status='EXPIRED'
      WHERE status='ACTIVE' AND expires_at <= NOW()
      RETURNING id
    )
    SELECT id FROM expired
  `);

  const ids: string[] = expired.rows.map((r: Record<string, unknown>) => String(r.id));
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

function webpayOptions(): Options {
  const env =
    process.env.WEBPAY_ENV === "production"
      ? Environment.Production
      : Environment.Integration;

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

function normalizeEmail(v: string) {
  return String(v || "").trim().toLowerCase();
}

export async function POST(req: Request) {
  let ownerEmail: string;
  try { ownerEmail = await paymentCreator(req); } catch (error) { return accessResponse(error); }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Body inválido (JSON)." });
  }

  const eventIdFromBody = pickString(body?.eventId);
  const itemsFromBody = parseItems(body?.items);

  const buyerName = pickString(body?.buyerName);
  const buyerEmailRaw = pickString(body?.buyerEmail);

  if (buyerName.length < 2) return json(400, { ok: false, error: "buyerName inválido." });
  if (!buyerEmailRaw.includes("@")) return json(400, { ok: false, error: "buyerEmail inválido." });

  if (!eventIdFromBody) return json(400, { ok: false, error: "Falta eventId." });
  if (itemsFromBody.length === 0) return json(400, { ok: false, error: "Faltan items (cart vacío)." });

  const buyerEmail = normalizeEmail(buyerEmailRaw); // recipient

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await releaseExpiredHoldsTx(client);

    const eventId = eventIdFromBody;

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

    const byId = new Map<string, Record<string, unknown>>();
    for (const r of ttRes.rows) byId.set(String(r.id), r);

    for (const it of itemsFromBody) {
      const r = byId.get(it.ticketTypeId)!;
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

    const holdId = makeId("hold");

    await client.query(
      `
      INSERT INTO holds (id, event_id, status, created_at, expires_at)
      VALUES ($1, $2, 'ACTIVE', NOW(), NOW() + ($3 || ' minutes')::interval)
      `,
      [holdId, eventId, String(HOLD_TTL_MINUTES)]
    );

    for (const it of itemsFromBody) {
      const r = byId.get(it.ticketTypeId)!;

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

    const itemsRes = await client.query(
      `
      SELECT ticket_type_name, unit_price_clp, qty
      FROM hold_items
      WHERE hold_id=$1
      ORDER BY ticket_type_name ASC
      `,
      [holdId]
    );

    const lineItems = itemsRes.rows.map((r: Record<string, unknown>) => {
      const unit = Math.round(Number(r.unit_price_clp) || 0);
      const qty = Math.floor(Number(r.qty) || 0);
      return { unit, qty };
    });

    const amountClp = lineItems.reduce((acc, x) => acc + x.unit * x.qty, 0);
    if (!Number.isFinite(amountClp) || amountClp <= 0) return json(409, { ok: false, error: "Monto inválido." });

    const evRes = await client.query(`SELECT title FROM events WHERE id=$1`, [eventId]);
    const eventTitle = pickString(evRes.rows?.[0]?.title) || `Evento ${eventId}`;

    const newPaymentId = makeId("pay");
    const payRes = await client.query(
      `
      INSERT INTO payments
        (id, hold_id, provider, provider_ref, event_id, event_title, buyer_name, buyer_email, owner_email, amount_clp, currency, status, created_at, updated_at)
      VALUES
        ($1, $2, 'webpay', NULL, $3, $4, $5, $6, $7, $8, 'CLP', 'CREATED', NOW(), NOW())
      RETURNING *
      `,
      [newPaymentId, holdId, eventId, eventTitle, buyerName, buyerEmail, ownerEmail, amountClp]
    );

    const payment = payRes.rows[0];
    if (String(payment.status).toUpperCase() === "PAID") {
      await client.query("COMMIT");
      return json(200, { ok: true, status: "PAID", holdId, paymentId: String(payment.id) });
    }

    const base = normalizeBaseUrl(appBaseUrl());
    const returnUrl = `${base}/api/payments/webpay/return`;

    const tx = new WebpayPlus.Transaction(webpayOptions());

    const buyOrder = String(payment.id).slice(0, 26);
    const sessionId = holdId;

    const resp = await tx.create(buyOrder, sessionId, Number(payment.amount_clp), returnUrl);

    await client.query(
      `
      UPDATE payments
      SET provider_ref=$2, status='PENDING', updated_at=NOW()
      WHERE id=$1
      `,
      [payment.id, String(resp.token)]
    );

    await client.query("COMMIT");

    return json(200, {
      ok: true,
      status: "PENDING",
      holdId,
      paymentId: String(payment.id),
      webpay: {
        url: String(resp.url),
        token: String(resp.token),
      },
    });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return accessResponse(e);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}
