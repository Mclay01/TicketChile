// apps/web/src/lib/checkout.pg.server.ts
import crypto from "crypto";
import { pool } from "./db";

type ConsumeArgs = {
  holdId: string;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
};

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function normalizeEmail(v: string) {
  const s = String(v || "").trim().toLowerCase();
  return s;
}

async function releaseExpiredHoldsTx(client: any) {
  const expired = await client.query(
    `
    SELECT id
    FROM holds
    WHERE status = 'ACTIVE' AND expires_at <= NOW()
    FOR UPDATE SKIP LOCKED
    `
  );

  const ids: string[] = expired.rows.map((r: any) => r.id);
  if (ids.length === 0) return;

  await client.query(
    `
    UPDATE ticket_types tt
    SET held = GREATEST(0, tt.held - x.qty)
    FROM (
      SELECT h.event_id, hi.ticket_type_id, SUM(hi.qty)::int AS qty
      FROM holds h
      JOIN hold_items hi ON hi.hold_id = h.id
      WHERE h.id = ANY($1::text[])
      GROUP BY h.event_id, hi.ticket_type_id
    ) x
    WHERE tt.event_id = x.event_id AND tt.id = x.ticket_type_id
    `,
    [ids]
  );

  await client.query(`UPDATE holds SET status='EXPIRED' WHERE id = ANY($1::text[])`, [ids]);
}

/**
 * DEMO (sin pago real): consume hold -> order+tickets.
 */
export async function consumeHoldToPaidOrderPg(args: ConsumeArgs) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await releaseExpiredHoldsTx(client);

    const res = await finalizeHoldToOrderCoreTx(client, {
      holdId: args.holdId,
      eventTitle: args.eventTitle,
      buyerName: args.buyerName,
      buyerEmail: normalizeEmail(args.buyerEmail),
      requirePaidPayment: false,
      paymentId: null,
    });

    await client.query("COMMIT");
    return res;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * REAL: llamado por webhook (Stripe) cuando el pago está confirmado.
 * Tx-friendly.
 */
export async function finalizePaidHoldToOrderPgTx(
  client: any,
  args: ConsumeArgs & { paymentId?: string | null }
) {
  await releaseExpiredHoldsTx(client);

  const paymentId = args.paymentId ?? null;

  return finalizeHoldToOrderCoreTx(client, {
    holdId: args.holdId,
    eventTitle: args.eventTitle,
    buyerName: args.buyerName,
    buyerEmail: normalizeEmail(args.buyerEmail),
    requirePaidPayment: true,
    paymentId,
  });
}

export async function finalizePaidHoldToOrderPg(args: ConsumeArgs & { paymentId?: string | null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await finalizePaidHoldToOrderPgTx(client, args);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// -------------------------
// Core (idempotente de verdad)
// -------------------------
async function finalizeHoldToOrderCoreTx(
  client: any,
  input: ConsumeArgs & {
    requirePaidPayment: boolean;
    paymentId: string | null;
  }
): Promise<{ order: any; tickets: any[] }> {
  const { holdId } = input;

  // 0) Lock hold
  const holdRes = await client.query(
    `
    SELECT id, event_id, status, expires_at
    FROM holds
    WHERE id = $1
    FOR UPDATE
    `,
    [holdId]
  );

  if (holdRes.rowCount === 0) throw new Error("Hold no existe.");

  const hold = holdRes.rows[0];

  // Idempotencia: si ya consumido, devuelve orden+tickets
  if (hold.status === "CONSUMED") {
    const orderRes = await client.query(`SELECT * FROM orders WHERE hold_id = $1`, [holdId]);
    if (orderRes.rowCount === 0) throw new Error("Orden no existe para este hold.");

    const order = orderRes.rows[0];
    const ticketsRes = await client.query(
      `SELECT * FROM tickets WHERE order_id = $1 ORDER BY created_at ASC`,
      [order.id]
    );

    return { order, tickets: ticketsRes.rows };
  }

  if (hold.status !== "ACTIVE") throw new Error(`Hold no está activo (${hold.status}).`);

  // expiró justo ahora -> expira + libera held
  if (new Date(hold.expires_at).getTime() <= Date.now()) {
    await client.query(`UPDATE holds SET status='EXPIRED' WHERE id=$1`, [holdId]);

    await client.query(
      `
      UPDATE ticket_types tt
      SET held = GREATEST(0, tt.held - x.qty)
      FROM (
        SELECT h.event_id, hi.ticket_type_id, SUM(hi.qty)::int AS qty
        FROM holds h
        JOIN hold_items hi ON hi.hold_id = h.id
        WHERE h.id = $1
        GROUP BY h.event_id, hi.ticket_type_id
      ) x
      WHERE tt.event_id = x.event_id AND tt.id = x.ticket_type_id
      `,
      [holdId]
    );

    throw new Error("Hold expiró.");
  }

  // 1) Flujo REAL: exige payment PAID (SIN amarrarlo a stripe, para soportar transfer después)
  if (input.requirePaidPayment) {
    const payRes = await client.query(
      `
      SELECT id, status, order_id
      FROM payments
      WHERE hold_id = $1
        AND ($2::text IS NULL OR id = $2::text)
      FOR UPDATE
      `,
      [holdId, input.paymentId]
    );

    if (payRes.rowCount === 0) throw new Error("No existe payment para este hold (o paymentId no coincide).");

    const p = payRes.rows[0];
    if (String(p.status).toUpperCase() !== "PAID") {
      throw new Error(`Payment no está PAID (status=${p.status}).`);
    }
  }

  // 2) Items del hold
  const itemsRes = await client.query(
    `
    SELECT ticket_type_id, ticket_type_name, unit_price_clp, qty
    FROM hold_items
    WHERE hold_id = $1
    `,
    [holdId]
  );
  if (itemsRes.rowCount === 0) throw new Error("Hold no tiene items.");

  // 3) Order idempotente por hold_id
  const newOrderId = makeId("ord");
  const buyerEmail = normalizeEmail(input.buyerEmail);

  const orderRes = await client.query(
    `
    INSERT INTO orders (id, hold_id, event_id, event_title, buyer_name, buyer_email, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (hold_id) DO UPDATE
      SET buyer_email = EXCLUDED.buyer_email,
          buyer_name  = EXCLUDED.buyer_name
    RETURNING *
    `,
    [newOrderId, holdId, hold.event_id, input.eventTitle, input.buyerName, buyerEmail]
  );
  const order = orderRes.rows[0];

  // 3.1) Linkear payments.order_id (si existe payment)
  await client.query(
    `
    UPDATE payments
    SET order_id = COALESCE(order_id, $2),
        updated_at = NOW()
    WHERE hold_id = $1
    `,
    [holdId, order.id]
  );

  // 4) Si ya existen tickets -> devolver
  const existingTickets = await client.query(
    `SELECT * FROM tickets WHERE order_id = $1 ORDER BY created_at ASC`,
    [order.id]
  );
  if (existingTickets.rowCount > 0) {
    return { order, tickets: existingTickets.rows };
  }

  // 5) Consumir hold
  await client.query(`UPDATE holds SET status='CONSUMED' WHERE id=$1`, [holdId]);

  // 6) held -> sold (set-based)
  await client.query(
    `
    UPDATE ticket_types tt
    SET held = GREATEST(0, tt.held - hi.qty),
        sold = tt.sold + hi.qty
    FROM hold_items hi
    WHERE hi.hold_id = $1
      AND tt.event_id = hi.event_id
      AND tt.id = hi.ticket_type_id
    `,
    [holdId]
  );

  // 7) Crear tickets
  const tickets: any[] = [];
  for (const it of itemsRes.rows) {
    for (let i = 0; i < Number(it.qty); i++) {
      const ticketId = makeId("tix");
      const tRes = await client.query(
        `
        INSERT INTO tickets (
          id, order_id, event_id, ticket_type_id, ticket_type_name,
          buyer_email, status, created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,'VALID',NOW())
        RETURNING *
        `,
        [ticketId, order.id, hold.event_id, it.ticket_type_id, it.ticket_type_name, buyerEmail]
      );
      tickets.push(tRes.rows[0]);
    }
  }

  return { order, tickets };
}
