// apps/web/src/app/api/payments/flow/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import { flowCreatePayment } from "@/lib/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOLD_TTL_MINUTES = 15;

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function toInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n);
}

function getOrigin(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    req.headers.get("origin") ||
    "http://localhost:3000"
  );
}

type HoldItem = { ticketTypeKey: string; qty: number };

/**
 * Detecta si existe public.ticket_types.slug (cacheado).
 */
declare global {
  // eslint-disable-next-line no-var
  var __ticketchile_ticketTypesSlugExists: Promise<boolean> | undefined;
}

function ticketTypesSlugExists(): Promise<boolean> {
  if (global.__ticketchile_ticketTypesSlugExists) return global.__ticketchile_ticketTypesSlugExists;

  global.__ticketchile_ticketTypesSlugExists = (async () => {
    const q = await pool.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ticket_types'
        AND column_name = 'slug'
      LIMIT 1
      `
    );
    return (q.rowCount ?? 0) > 0;
  })();

  return global.__ticketchile_ticketTypesSlugExists;
}

/**
 * Normaliza strings para comparar "slug-like"
 */
function toKeyLike(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Genera variantes razonables para encontrar un ticket type aunque el front mande keys distintas.
 */
function keyVariants(k: string) {
  const raw = String(k || "").trim();
  const set = new Set<string>();
  if (!raw) return [];

  set.add(raw);
  set.add(raw.toLowerCase());

  const noPrefix = raw.replace(/^tt_/i, "");
  if (noPrefix && noPrefix !== raw) {
    set.add(noPrefix);
    set.add(noPrefix.toLowerCase());
  }

  const keyLike = toKeyLike(raw);
  if (keyLike) set.add(keyLike);

  const keyLikeNoPrefix = toKeyLike(noPrefix);
  if (keyLikeNoPrefix) {
    set.add(keyLikeNoPrefix);
    set.add(`tt_${keyLikeNoPrefix}`);
  }

  if (!/^tt_/i.test(raw) && keyLike) set.add(`tt_${keyLike}`);

  return Array.from(set);
}

export async function POST(req: NextRequest) {
  const reqId = `flow_create_${randomUUID().slice(0, 8)}`;

  try {
    mustEnv("FLOW_API_KEY");
    mustEnv("FLOW_SECRET_KEY");

    const body = await req.json().catch(() => ({} as any));

    const eventId = pickString(body?.eventId);
    const buyerName = pickString(body?.buyerName);
    const buyerEmail = pickString(body?.buyerEmail).toLowerCase();
    const clientAmount = toInt(body?.amount); // 👈 viene del client, NO se confía

    const itemsRaw = Array.isArray(body?.items) ? body.items : [];
    const items: HoldItem[] = itemsRaw
      .map((x: any): HoldItem => ({
        ticketTypeKey: pickString(x?.ticketTypeId || x?.ticketTypeKey || x?.ticketTypeSlug),
        qty: Math.floor(Number(x?.qty)),
      }))
      .filter((x: HoldItem) => x.ticketTypeKey && Number.isFinite(x.qty) && x.qty > 0);

    console.log("[flow:create][in]", {
      reqId,
      eventId: eventId || null,
      buyerNameLen: buyerName.length,
      buyerEmail: buyerEmail ? buyerEmail.replace(/(.{2}).+(@.+)/, "$1***$2") : "",
      itemsCount: items.length,
      itemKeys: items.map((i) => i.ticketTypeKey),
      clientAmount,
    });

    if (!eventId) return NextResponse.json({ ok: false, error: "eventId_missing" }, { status: 400 });
    if (!buyerName || buyerName.length < 2)
      return NextResponse.json({ ok: false, error: "buyerName_invalid" }, { status: 400 });
    if (!buyerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail))
      return NextResponse.json({ ok: false, error: "buyerEmail_invalid" }, { status: 400 });
    if (items.length === 0) return NextResponse.json({ ok: false, error: "items_empty" }, { status: 400 });

    let paymentId = "";
    let holdId = "";
    let total = 0;
    let eventTitle = "";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Event (DB source of truth)
      const ev = await client.query(`SELECT id, title FROM events WHERE id = $1`, [eventId]);
      if (ev.rowCount === 0) {
        // 👇 Debug útil: qué hay realmente en DB
        const list = await client.query(`SELECT id, title FROM events ORDER BY created_at DESC NULLS LAST LIMIT 25`);
        await client.query("ROLLBACK");

        console.warn("[flow:create] event_not_found", {
          reqId,
          eventId,
          dbEvents: list.rows?.map((r) => ({ id: String(r.id), title: String(r.title) })) ?? [],
        });

        return NextResponse.json(
          {
            ok: false,
            error: "event_not_found",
            eventId,
            hint:
              "Este endpoint usa la DB. Si tu UI usa src/lib/events.ts, debes seedear events/ticket_types en DB o migrar la UI a DB.",
            dbEvents: list.rows?.map((r) => ({ id: String(r.id), title: String(r.title) })) ?? [],
          },
          { status: 404 }
        );
      }
      eventTitle = String(ev.rows[0].title || "");

      const hasSlug = await ticketTypesSlugExists();

      // Ticket types del evento (DB)
      const tt = hasSlug
        ? await client.query(
            `SELECT id, slug, name, price_clp, capacity, sold, held
               FROM ticket_types
              WHERE event_id = $1`,
            [eventId]
          )
        : await client.query(
            `SELECT id, name, price_clp, capacity, sold, held
               FROM ticket_types
              WHERE event_id = $1`,
            [eventId]
          );

      const byKey = new Map<string, any>();

      for (const row of tt.rows) {
        const id = String(row.id);
        const name = String(row.name || "");
        const nameKey = toKeyLike(name);

        byKey.set(id, row);
        byKey.set(id.toLowerCase(), row);

        if (nameKey) {
          byKey.set(nameKey, row);
          byKey.set(`tt_${nameKey}`, row);
        }

        if (hasSlug) {
          const slug = String((row as any).slug || "").trim();
          if (slug) {
            byKey.set(slug, row);
            byKey.set(slug.toLowerCase(), row);
            const slugKey = toKeyLike(slug);
            if (slugKey) {
              byKey.set(slugKey, row);
              byKey.set(`tt_${slugKey}`, row);
            }
          }
        }
      }

      // Resolver cada item del request
      const resolved: Array<{ reqKey: string; row: any; qty: number }> = [];
      const missing: string[] = [];

      for (const it of items) {
        const variants = keyVariants(it.ticketTypeKey);
        let row: any | undefined;

        for (const v of variants) {
          row = byKey.get(v);
          if (row) break;
        }

        if (!row) {
          missing.push(it.ticketTypeKey);
          continue;
        }

        resolved.push({ reqKey: it.ticketTypeKey, row, qty: it.qty });
      }

      if (missing.length > 0) {
        const available = tt.rows.map((r) => ({
          id: String(r.id),
          ...(hasSlug ? { slug: String((r as any).slug || "") } : {}),
          name: String(r.name || ""),
          price_clp: Number(r.price_clp),
        }));

        await client.query("ROLLBACK");
        console.warn("[flow:create] ticket types missing", { reqId, missing, availableCount: available.length });

        return NextResponse.json(
          { ok: false, error: "ticket_type_not_found", missing, available },
          { status: 400 }
        );
      }

      // Total server-side (DB price_clp)
      total = 0;
      for (const x of resolved) {
        total += Number(x.row.price_clp) * x.qty;
      }

      if (!Number.isFinite(total) || total <= 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "amount_invalid" }, { status: 400 });
      }

      // 👇 Detecta mismatch: UI vs DB
      if (clientAmount > 0 && clientAmount !== total) {
        await client.query("ROLLBACK");

        console.warn("[flow:create] amount_mismatch", { reqId, clientAmount, serverAmount: total, eventId });

        return NextResponse.json(
          {
            ok: false,
            error: "amount_mismatch",
            clientAmount,
            serverAmount: total,
            hint:
              "Tu UI (events.ts) y tu DB (ticket_types.price_clp) no coinciden. Deja una sola fuente de precios.",
          },
          { status: 409 }
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

      // Reservar held + hold_items
      for (const x of resolved) {
        const ticketTypeId = String(x.row.id);
        const ticketTypeName = String(x.row.name);

        const u = await client.query(
          `UPDATE ticket_types
             SET held = held + $3
           WHERE event_id = $1
             AND id = $2
             AND (sold + held + $3) <= capacity
           RETURNING id`,
          [eventId, ticketTypeId, x.qty]
        );

        if (u.rowCount === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ ok: false, error: "capacity_exceeded" }, { status: 409 });
        }

        await client.query(
          `INSERT INTO hold_items
            (hold_id, event_id, ticket_type_id, ticket_type_name, unit_price_clp, qty)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [holdId, eventId, ticketTypeId, ticketTypeName, Number(x.row.price_clp), x.qty]
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
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }

    // Flow call (fuera TX)
    const origin = getOrigin(req);
    const urlConfirmation = `${origin}/api/payments/flow/confirm`;
    const urlReturn = `${origin}/api/payments/flow/kick`;

    let flowRes: { url: string; token: string; flowOrder: number };
    try {
      flowRes = await flowCreatePayment({
        commerceOrder: paymentId,
        subject: `Compra tickets - ${eventTitle}`,
        amount: total,
        email: buyerEmail,
        urlReturn,
        urlConfirmation,
        timeoutSeconds: HOLD_TTL_MINUTES * 60,
        optional: { eventId, holdId, paymentId },
      });
    } catch (err: any) {
      // cleanup
      const c = await pool.connect();
      try {
        await c.query("BEGIN");

        await c.query(`UPDATE payments SET status = 'FAILED', updated_at = NOW() WHERE id = $1`, [paymentId]);

        const hi = await c.query(`SELECT event_id, ticket_type_id, qty FROM hold_items WHERE hold_id = $1`, [holdId]);
        for (const row of hi.rows) {
          await c.query(
            `UPDATE ticket_types
               SET held = GREATEST(held - $3, 0)
             WHERE event_id = $1 AND id = $2`,
            [String(row.event_id), String(row.ticket_type_id), Number(row.qty)]
          );
        }

        await c.query(`UPDATE holds SET status = 'EXPIRED' WHERE id = $1`, [holdId]);
        await c.query("COMMIT");
      } catch {
        try {
          await c.query("ROLLBACK");
        } catch {}
      } finally {
        c.release();
      }

      return NextResponse.json(
        { ok: false, provider: "flow", error: "flow_create_failed", detail: err?.message ?? String(err) },
        { status: 502 }
      );
    }

    const checkoutUrl = `${flowRes.url}?token=${encodeURIComponent(flowRes.token)}`;

    // guardar token
    const c2 = await pool.connect();
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

    console.log("[flow:create][out]", { reqId, paymentId, holdId, total, checkout: true });

    return NextResponse.json({
      ok: true,
      provider: "flow",
      paymentId,
      checkoutUrl,
      token: flowRes.token,
      amount: total,
    });
  } catch (err: any) {
    console.error("[flow:create][err]", { reqId, err: err?.message ?? String(err) });
    return NextResponse.json(
      { ok: false, error: "internal_error", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
