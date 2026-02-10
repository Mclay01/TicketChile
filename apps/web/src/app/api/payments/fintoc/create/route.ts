import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { pool } from "@/lib/db";
import { appBaseUrl } from "@/lib/stripe.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOLD_TTL_MINUTES = 8;

type FintocEnv = "test" | "live";

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

// ✅ Nuevo: selector de ambiente (test/live)
function fintocEnv(): FintocEnv {
  const raw = String(process.env.FINTOC_ENV || "").trim().toLowerCase();

  if (raw === "live" || raw === "prod" || raw === "production") return "live";
  if (raw === "test" || raw === "sandbox") return "test";

  // Si no está seteado: en producción asumimos live; en dev/preview asumimos test.
  const vercelEnv = String(process.env.VERCEL_ENV || "").toLowerCase(); // production | preview | development
  if (vercelEnv === "production") return "live";

  return "test";
}

// ✅ Nuevo: permitir keys separadas por ambiente, sin romper lo actual
function getFintocSecretKey(env: FintocEnv) {
  const testKey = String(process.env.FINTOC_SECRET_KEY_TEST || "").trim();
  const liveKey = String(process.env.FINTOC_SECRET_KEY_LIVE || "").trim();
  const fallback = String(process.env.FINTOC_SECRET_KEY || "").trim(); // compat

  const key = env === "live" ? (liveKey || fallback) : (testKey || fallback);
  const source =
    env === "live"
      ? (liveKey ? "FINTOC_SECRET_KEY_LIVE" : "FINTOC_SECRET_KEY")
      : (testKey ? "FINTOC_SECRET_KEY_TEST" : "FINTOC_SECRET_KEY");

  return { key, source };
}

function keyHint(k: string) {
  // solo para debug (no expone la key)
  if (!k) return "";
  const head = k.slice(0, 6);
  const tail = k.slice(-4);
  return `${head}…${tail}`;
}

export async function POST(req: Request) {
  const env = fintocEnv();
  const { key: apiKey, source: keySource } = getFintocSecretKey(env);

  // Fail-fast claro
  if (!apiKey) {
    return json(500, {
      ok: false,
      error:
        env === "live"
          ? "Fintoc LIVE activo pero falta FINTOC_SECRET_KEY_LIVE (o FINTOC_SECRET_KEY)."
          : "Fintoc TEST activo pero falta FINTOC_SECRET_KEY_TEST (o FINTOC_SECRET_KEY).",
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Body inválido (JSON)." });
  }

  const eventIdFromBody = pickString(body?.eventId);
  const itemsFromBody = parseItems(body?.items);

  const buyerName = pickString(body?.buyerName);
  const buyerEmail = pickString(body?.buyerEmail);

  if (buyerName.length < 2) return json(400, { ok: false, error: "buyerName inválido." });
  if (!buyerEmail.includes("@")) return json(400, { ok: false, error: "buyerEmail inválido." });

  if (!eventIdFromBody) return json(400, { ok: false, error: "Falta eventId." });
  if (itemsFromBody.length === 0) return json(400, { ok: false, error: "Faltan items (cart vacío)." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await releaseExpiredHoldsTx(client);

    const eventId = eventIdFromBody;

    // stock + hold
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

    const holdId = makeId("hold");

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

    // total
    const itemsRes = await client.query(
      `
      SELECT unit_price_clp, qty
      FROM hold_items
      WHERE hold_id=$1
      `,
      [holdId]
    );

    const amountClp = itemsRes.rows.reduce((acc: number, r: any) => {
      const unit = Math.round(Number(r.unit_price_clp) || 0);
      const qty = Math.floor(Number(r.qty) || 0);
      return acc + unit * qty;
    }, 0);

    if (!Number.isFinite(amountClp) || amountClp <= 0) return json(409, { ok: false, error: "Monto inválido." });

    const evRes = await client.query(`SELECT title FROM events WHERE id=$1`, [eventId]);
    const eventTitle = pickString(evRes.rows?.[0]?.title) || `Evento ${eventId}`;

    // payment
    const newPaymentId = makeId("pay");
    const payRes = await client.query(
      `
      INSERT INTO payments
        (id, hold_id, provider, provider_ref, event_id, event_title, buyer_name, buyer_email, amount_clp, currency, status, created_at, updated_at)
      VALUES
        ($1, $2, 'fintoc', NULL, $3, $4, $5, $6, $7, 'CLP', 'CREATED', NOW(), NOW())
      ON CONFLICT (hold_id) DO UPDATE
        SET event_id     = EXCLUDED.event_id,
            event_title  = EXCLUDED.event_title,
            buyer_name   = EXCLUDED.buyer_name,
            buyer_email  = EXCLUDED.buyer_email,
            amount_clp   = EXCLUDED.amount_clp,
            provider     = 'fintoc',
            updated_at   = NOW()
      RETURNING *
      `,
      [newPaymentId, holdId, eventId, eventTitle, buyerName, buyerEmail, amountClp]
    );

    const payment = payRes.rows[0];
    if (String(payment.status).toUpperCase() === "PAID") {
      await client.query("COMMIT");
      return json(200, { ok: true, status: "PAID", holdId, paymentId: String(payment.id), checkoutUrl: "" });
    }

    const base = normalizeBaseUrl(appBaseUrl());
    const successUrl = `${base}/checkout/confirm?payment_id=${encodeURIComponent(String(payment.id))}`;
    const cancelUrl = `${base}/checkout/${encodeURIComponent(eventId)}?canceled=1`;

    // ✅ LOG útil en Vercel
    console.log("[fintoc:create] env=", env, "key=", keyHint(apiKey), "source=", keySource, "paymentId=", String(payment.id));

    // Fintoc checkout session
    const r = await fetch("https://api.fintoc.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        amount: Number(payment.amount_clp),
        currency: "clp",
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
          fintocEnv: env, // ✅ solo metadata
        },
      }),
    });

    const raw = await r.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      // si no es JSON, dejamos raw como fallback
    }

    if (!r.ok) {
      const msg =
        (typeof data?.message === "string" && data.message) ||
        (typeof data?.error?.message === "string" && data.error.message) ||
        (typeof data?.error === "string" && data.error) ||
        (typeof data?.error_description === "string" && data.error_description) ||
        (raw ? raw.slice(0, 800) : "") ||
        `Error Fintoc ${r.status}`;

      console.error("[fintoc:create] fintoc_error", {
        status: r.status,
        body: data ?? raw,
      });

      throw new Error(msg);
    }

    // si está ok, ahora sí necesitamos JSON
    if (!data) {
      throw new Error("Fintoc respondió OK pero no devolvió JSON válido.");
    }


    const checkoutSessionId = String(data?.id || "");
    const redirectUrl = String(data?.redirect_url || "");

    if (!checkoutSessionId || !redirectUrl) {
      throw new Error("Fintoc no devolvió id/redirect_url.");
    }

    await client.query(
      `
      UPDATE payments
      SET provider_ref=$2, status='PENDING', updated_at=NOW()
      WHERE id=$1
      `,
      [payment.id, checkoutSessionId]
    );

    await client.query("COMMIT");

    return json(200, {
      ok: true,
      status: "PENDING",
      holdId,
      paymentId: String(payment.id),
      checkoutUrl: redirectUrl,

      // ✅ Debug: así confirmas en Network qué ambiente estás usando
      fintocEnv: env,
      fintocKey: keyHint(apiKey),
      fintocKeySource: keySource,
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
