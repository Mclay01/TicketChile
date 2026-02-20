import { NextRequest, NextResponse } from "next/server";
import { withTx, pool } from "@/lib/db";
import { flowGetStatus } from "@/lib/flow";
import { sendTicketEmail } from "@/lib/tickets.email";
import { apiUrl } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOrigin(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || req.headers.get("origin") || "http://localhost:3000";
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

function normalizeEmail(v: any) {
  return String(v || "").trim().toLowerCase();
}

function uniqEmails(emails: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const e of emails) {
    const n = normalizeEmail(e);
    if (n.includes("@")) set.add(n);
  }
  return Array.from(set);
}

function normalizeBaseUrl(u: string) {
  return String(u || "").replace(/\/+$/, "");
}

function baseUrlFromRequest(req: NextRequest) {
  const envBase = normalizeBaseUrl(String(process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "").trim());
  if (envBase) return envBase;

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (!host) return "";
  return normalizeBaseUrl(`${proto}://${host}`);
}

async function fetchQrPngBase64(req: NextRequest, ticketId: string, eventId: string) {
  try {
    const base = baseUrlFromRequest(req);
    if (!base) return null;

    const path = apiUrl(`/qr?ticketId=${encodeURIComponent(ticketId)}&eventId=${encodeURIComponent(eventId)}`);
    const url = `${base}${path}`;

    const cookie = req.headers.get("cookie") || "";

    const r = await fetch(url, {
      method: "GET",
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });

    if (!r.ok) return null;

    const ab = await r.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");
    return b64 || null;
  } catch {
    return null;
  }
}

/**
 * Detecta si existen columnas emailed_at / emailed_to en tickets (cacheado).
 */
declare global {
  // eslint-disable-next-line no-var
  var __ticketchile_ticketsEmailCols: Promise<boolean> | undefined;
}

async function ticketsEmailColsExist(): Promise<boolean> {
  if (global.__ticketchile_ticketsEmailCols) return global.__ticketchile_ticketsEmailCols;

  global.__ticketchile_ticketsEmailCols = (async () => {
    const q = await pool.query(
      `
      SELECT COUNT(*)::int AS cnt
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='tickets'
        AND column_name IN ('emailed_at','emailed_to')
      `
    );
    const cnt = Number(q.rows?.[0]?.cnt || 0);
    return cnt >= 2;
  })();

  return global.__ticketchile_ticketsEmailCols;
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

/**
 * Auto-email idempotente por orden.
 * - marca emailed_at/emailed_to para “reclamar” tickets y no duplicar
 */
async function autoEmailOrderTickets(req: NextRequest, orderId: string) {
  const hasCols = await ticketsEmailColsExist();
  if (!hasCols) return { attempted: false, reason: "missing_email_columns", sent: 0, failed: 0 };

  // 1) Reclamar tickets no enviados aún
  const client = await pool.connect();
  let claimed: Array<{ id: string; event_id: string; ticket_type_name: string; status: string }> = [];
  let order: any = null;
  try {
    await client.query("BEGIN");

    const oRes = await client.query(
      `SELECT id, buyer_name, buyer_email, owner_email, event_id, event_title FROM orders WHERE id=$1 LIMIT 1 FOR UPDATE`,
      [orderId]
    );
    if (oRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return { attempted: false, reason: "order_not_found", sent: 0, failed: 0 };
    }
    order = oRes.rows[0];

    const to = uniqEmails([order.buyer_email, order.owner_email]);
    if (to.length === 0) {
      await client.query("ROLLBACK");
      return { attempted: false, reason: "no_recipients", sent: 0, failed: 0 };
    }

    const tClaim = await client.query(
      `
      UPDATE tickets
         SET emailed_at = NOW(),
             emailed_to = $2
       WHERE order_id=$1
         AND (emailed_at IS NULL)
       RETURNING id, event_id, ticket_type_name, status
      `,
      [orderId, to.join(",")]
    );

    claimed = tClaim.rows.map((r: any) => ({
      id: String(r.id),
      event_id: String(r.event_id),
      ticket_type_name: String(r.ticket_type_name || ""),
      status: String(r.status || ""),
    }));

    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return { attempted: true, reason: "error", sent: 0, failed: 0 };
  } finally {
    client.release();
  }

  if (claimed.length === 0) return { attempted: true, reason: "nothing_to_send", sent: 0, failed: 0 };

  // 2) Enviar fuera de tx
  const to = uniqEmails([order?.buyer_email, order?.owner_email]);
  const buyerName = String(order?.buyer_name || "");
  const buyerEmail = normalizeEmail(order?.buyer_email);
  const ownerEmail = normalizeEmail(order?.owner_email);
  const eventTitle = String(order?.event_title || "");

  const eRes = await pool.query(`SELECT city, venue, date_iso FROM events WHERE id=$1 LIMIT 1`, [String(order?.event_id)]);
  const ev = eRes.rows?.[0] || {};

  let sent = 0;
  let failed = 0;

  for (const t of claimed) {
    const qrPngBase64 = t.event_id ? await fetchQrPngBase64(req, t.id, t.event_id) : null;

    let okAny = false;
    for (const email of to) {
      try {
        await sendTicketEmail({
          to: [email],
          ticket: {
            id: t.id,
            status: t.status,
            ticketTypeName: t.ticket_type_name,
            qrPngBase64,
          },
          order: {
            id: orderId,
            buyerName,
            buyerEmail,
            ownerEmail: ownerEmail || buyerEmail || "",
          },
          event: {
            id: String(order?.event_id || ""),
            title: eventTitle,
            city: String(ev.city || ""),
            venue: String(ev.venue || ""),
            dateISO: ev.date_iso ? new Date(ev.date_iso).toISOString() : "",
          },
        });
        okAny = true;
      } catch {
        // seguimos intentando con el resto
      }
    }

    if (okAny) {
      sent += 1;
    } else {
      failed += 1;
      // best-effort revert: permitir reintento automático si falló para todos
      try {
        await pool.query(`UPDATE tickets SET emailed_at=NULL, emailed_to=NULL WHERE id=$1`, [t.id]);
      } catch {}
    }
  }

  return { attempted: true, reason: "done", sent, failed };
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
    return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=${encodeURIComponent(err?.message || "flow_error")}`, origin));
  }
}

export async function POST(req: NextRequest) {
  const origin = getOrigin(req);

  try {
    const ct = req.headers.get("content-type") || "";
    const accept = req.headers.get("accept") || "";
    const secFetchDest = req.headers.get("sec-fetch-dest") || "";
    const secFetchMode = req.headers.get("sec-fetch-mode") || "";
    const isBrowser =
      accept.includes("text/html") ||
      secFetchDest === "document" ||
      secFetchMode === "navigate";

    let paymentId = "";
    let token = "";
    let cameFromJson = false;

    if (ct.includes("application/json")) {
      cameFromJson = true;
      const j = await req.json().catch(() => ({} as any));
      paymentId = pickString(j?.paymentId);
      token = pickString(j?.token);
    } else {
      token = await readTokenFromFormOrQuery(req);
    }

    if (!token) {
      if (!cameFromJson || isBrowser) {
        return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=missing_token`, origin));
      }
      return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
    }

    const st = await flowGetStatus(token);
    const commerceOrder = pickString(st?.commerceOrder);
    const flowStatus = Number(st?.status || 0);

    if (!paymentId) paymentId = commerceOrder;
    if (!paymentId) {
      if (!cameFromJson || isBrowser) {
        return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=missing_payment`, origin));
      }
      return NextResponse.json({ ok: false, error: "missing_payment" }, { status: 400 });
    }

    const localStatus = mapFlowStatusToLocal(flowStatus);
    let orderIdFromFinalize = "";

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
        const r = await finalizePaidPayment(c, paymentId);
        orderIdFromFinalize = String(r?.orderId || "");
      }
    });

    // ✅ Envío automático inmediato al confirmar pago
    if (localStatus === "PAID") {
      // si finalize no devolvió orderId (raro), lo resolvemos
      let orderId = orderIdFromFinalize;
      if (!orderId) {
        const oRes = await pool.query(`SELECT order_id FROM payments WHERE id=$1 LIMIT 1`, [paymentId]);
        orderId = oRes.rows?.[0]?.order_id ? String(oRes.rows[0].order_id) : "";
      }
      if (orderId) {
        await autoEmailOrderTickets(req, orderId);
      }
    }

    if (!cameFromJson || isBrowser) {
      if (localStatus === "FAILED" || localStatus === "CANCELLED") {
        return NextResponse.redirect(new URL(`/checkout?canceled=1&reason=${localStatus}`, origin));
      }

      return NextResponse.redirect(
        new URL(`/checkout/confirm?payment_id=${encodeURIComponent(paymentId)}&flow_token=${encodeURIComponent(token)}`, origin)
      );
    }

    return NextResponse.json({ ok: true, paymentId, localStatus }, { status: 200 });
  } catch (err: any) {
    const ct = req.headers.get("content-type") || "";
    const accept = req.headers.get("accept") || "";
    const secFetchDest = req.headers.get("sec-fetch-dest") || "";
    const secFetchMode = req.headers.get("sec-fetch-mode") || "";
    const isBrowser =
      accept.includes("text/html") ||
      secFetchDest === "document" ||
      secFetchMode === "navigate";

    const cameFromJson = ct.includes("application/json");

    if (!cameFromJson || isBrowser) {
      return NextResponse.redirect(
        new URL(`/checkout?canceled=1&reason=${encodeURIComponent(err?.message || "flow_error")}`, origin)
      );
    }

    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}