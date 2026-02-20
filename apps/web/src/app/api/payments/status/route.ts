import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";
import { sendTicketEmail } from "@/lib/tickets.email";
import { apiUrl } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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

// ✅ Base URL robusta para server->server fetch en Vercel
function baseUrlFromRequest(req: Request) {
  const envBase = normalizeBaseUrl(String(process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "").trim());
  if (envBase) return envBase;

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (!host) return "";
  return normalizeBaseUrl(`${proto}://${host}`);
}

async function fetchQrPngBase64(req: Request, ticketId: string, eventId: string) {
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

/**
 * Reclama (idempotente) tickets NO enviados de una orden para enviarlos por email.
 * - requiere columns emailed_at/emailed_to
 * - marca emailed_at antes del envío para evitar duplicados por polling
 * - si el envío falla a TODOS los destinatarios de ese ticket, intenta revertir emailed_at=NULL
 */
async function autoEmailOrderTickets(req: Request, orderId: string) {
  const hasCols = await ticketsEmailColsExist();
  if (!hasCols) {
    // Sin columnas: NO auto-email aquí (evita duplicados).
    // (El usuario debe ejecutar el SQL que te dejo abajo)
    return { attempted: false, reason: "missing_email_columns", sent: 0, failed: 0 };
  }

  const client = await pool.connect();
  let claimed: Array<{
    id: string;
    order_id: string;
    event_id: string;
    ticket_type_name: string;
    buyer_email: string;
    owner_email: string;
    status: string;
  }> = [];

  try {
    await client.query("BEGIN");

    // Traer destinatarios desde order
    const oRes = await client.query(
      `SELECT id, buyer_name, buyer_email, owner_email, event_id, event_title FROM orders WHERE id=$1 LIMIT 1 FOR UPDATE`,
      [orderId]
    );
    if (oRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return { attempted: false, reason: "order_not_found", sent: 0, failed: 0 };
    }

    const order = oRes.rows[0];
    const buyerEmail = normalizeEmail(order.buyer_email);
    const ownerEmail = normalizeEmail(order.owner_email);

    const to = uniqEmails([buyerEmail, ownerEmail]);
    if (to.length === 0) {
      await client.query("ROLLBACK");
      return { attempted: false, reason: "no_recipients", sent: 0, failed: 0 };
    }

    // ✅ Reclamar tickets no enviados aún (FOR UPDATE implícito por UPDATE)
    const tClaim = await client.query(
      `
      UPDATE tickets
         SET emailed_at = NOW(),
             emailed_to = $2
       WHERE order_id = $1
         AND (emailed_at IS NULL)
       RETURNING id, order_id, event_id, ticket_type_name, buyer_email, owner_email, status
      `,
      [orderId, to.join(",")]
    );

    claimed = tClaim.rows.map((r: any) => ({
      id: String(r.id),
      order_id: String(r.order_id),
      event_id: String(r.event_id),
      ticket_type_name: String(r.ticket_type_name || ""),
      buyer_email: normalizeEmail(r.buyer_email),
      owner_email: normalizeEmail(r.owner_email),
      status: String(r.status || ""),
    }));

    await client.query("COMMIT");

    // Nada que enviar
    if (claimed.length === 0) {
      return { attempted: true, reason: "nothing_to_send", sent: 0, failed: 0 };
    }

    // Envío fuera de TX
    let sent = 0;
    let failed = 0;

    for (const t of claimed) {
      const qrPngBase64 = t.event_id ? await fetchQrPngBase64(req, t.id, t.event_id) : null;

      // Re-leer event/order info para plantilla (sin TX)
      const eRes = await pool.query(`SELECT city, venue, date_iso FROM events WHERE id=$1 LIMIT 1`, [t.event_id]);
      const ev = eRes.rows?.[0] || {};

      // order info (buyer_name / event_title)
      const o2 = await pool.query(
        `SELECT buyer_name, buyer_email, owner_email, event_title FROM orders WHERE id=$1 LIMIT 1`,
        [orderId]
      );
      const oRow = o2.rows?.[0] || {};

      const buyerName = String(oRow.buyer_name || "");
      const buyerEmail = normalizeEmail(oRow.buyer_email);
      const ownerEmail = normalizeEmail(oRow.owner_email);
      const eventTitle = String(oRow.event_title || "");

      const recipients = uniqEmails([buyerEmail, ownerEmail]);
      let okAny = false;
      const errs: string[] = [];

      for (const email of recipients) {
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
              id: t.event_id,
              title: eventTitle,
              city: String(ev.city || ""),
              venue: String(ev.venue || ""),
              dateISO: ev.date_iso ? new Date(ev.date_iso).toISOString() : "",
            },
          });

          okAny = true;
        } catch (e: any) {
          errs.push(String(e?.message || e));
        }
      }

      if (okAny) {
        sent += 1;
      } else {
        failed += 1;

        // Best-effort: si falló a TODOS, revertimos marca para permitir reintento automático
        try {
          await pool.query(`UPDATE tickets SET emailed_at = NULL, emailed_to = NULL WHERE id=$1`, [t.id]);
        } catch {
          // si esto falla, igual queda como "marcado"; el usuario puede usar /resend manual.
        }
      }
    }

    return { attempted: true, reason: "done", sent, failed };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return { attempted: true, reason: "error", sent: 0, failed: claimed.length || 0 };
  } finally {
    client.release();
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const paymentId = String(searchParams.get("payment_id") ?? "").trim();

  if (!paymentId) return json(400, { ok: false, error: "payment_id requerido." });

  const client = await pool.connect();
  let orderId = "";
  let tickets: any[] = [];
  let statusUpper = "";
  let payment: any = null;

  try {
    await client.query("BEGIN");

    const pRes = await client.query(
      `
      SELECT
        id, hold_id, order_id, status, provider,
        buyer_name, buyer_email, owner_email, event_title, amount_clp
      FROM payments
      WHERE id=$1
      LIMIT 1
      FOR UPDATE
      `,
      [paymentId]
    );

    if (pRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return json(404, { ok: false, error: "Pago no encontrado." });
    }

    payment = pRes.rows[0];
    statusUpper = String(payment.status || "").toUpperCase();

    // resolver order_id (si no está)
    orderId = payment.order_id ? String(payment.order_id) : "";
    if (!orderId && payment.hold_id) {
      const oRes = await client.query(`SELECT id FROM orders WHERE hold_id=$1 LIMIT 1`, [String(payment.hold_id)]);
      orderId = oRes.rows?.[0]?.id ? String(oRes.rows[0].id) : "";
    }

    // tickets (previo)
    if (orderId) {
      const tRes = await client.query(
        `
        SELECT id, order_id, event_id, ticket_type_name, buyer_email, status, created_at
        FROM tickets
        WHERE order_id=$1
        ORDER BY created_at ASC
        `,
        [orderId]
      );

      tickets = tRes.rows.map((t: any) => ({
        id: String(t.id),
        orderId: String(t.order_id),
        eventId: String(t.event_id),
        ticketTypeName: String(t.ticket_type_name),
        buyerEmail: String(t.buyer_email),
        status: String(t.status),
        createdAtISO: t.created_at,
      }));
    }

    // ✅ si ya está PAID pero aún no hay tickets, intentar emitir (idempotente)
    if (statusUpper === "PAID" && (!orderId || tickets.length === 0)) {
      const holdId = String(payment.hold_id || "");
      const buyerEmail = String(payment.buyer_email || "");
      const buyerName = String(payment.buyer_name || "");
      const eventTitle = String(payment.event_title || "");

      if (holdId && buyerEmail.includes("@") && buyerName.length >= 2 && eventTitle) {
        try {
          await finalizePaidHoldToOrderPgTx(client, {
            holdId,
            eventTitle,
            buyerName,
            buyerEmail,
            paymentId: String(payment.id),
          });
        } catch {
          // carrera: otro proceso ganó (webhook/kick). OK.
        }
      }

      if (holdId) {
        const oRes2 = await client.query(`SELECT id FROM orders WHERE hold_id=$1 LIMIT 1`, [holdId]);
        orderId = oRes2.rows?.[0]?.id ? String(oRes2.rows[0].id) : orderId;
      }

      if (orderId) {
        const tRes2 = await client.query(
          `
          SELECT id, order_id, event_id, ticket_type_name, buyer_email, status, created_at
          FROM tickets
          WHERE order_id=$1
          ORDER BY created_at ASC
          `,
          [orderId]
        );

        tickets = tRes2.rows.map((t: any) => ({
          id: String(t.id),
          orderId: String(t.order_id),
          eventId: String(t.event_id),
          ticketTypeName: String(t.ticket_type_name),
          buyerEmail: String(t.buyer_email),
          status: String(t.status),
          createdAtISO: t.created_at,
        }));
      }
    }

    await client.query("COMMIT");
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return json(500, { ok: false, error: String(e?.message || e) });
  } finally {
    client.release();
  }

  // ✅ Envío automático (fuera TX): solo si PAID y ya hay orden + tickets
  let autoEmail: any = null;
  if (String(payment?.status || "").toUpperCase() === "PAID" && orderId && tickets.length > 0) {
    autoEmail = await autoEmailOrderTickets(req, orderId);
  }

  return json(200, {
    ok: true,
    payment: {
      id: String(payment.id),
      holdId: String(payment.hold_id),
      orderId,
      provider: String(payment.provider || ""),
      status: String(payment.status || ""),
      buyerName: String(payment.buyer_name || ""),
      buyerEmail: String(payment.buyer_email || ""),
      ownerEmail: String(payment.owner_email || ""),
      eventTitle: String(payment.event_title || ""),
      amountClp: Number(payment.amount_clp || 0),
    },
    tickets,
    autoEmail,
  });
}