// apps/web/src/lib/checkout.pg.server.ts
import crypto from "crypto";
import { pool } from "./db";

type ConsumeArgs = {
  holdId: string;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string; // recipient (checkout)
};

type PreparePaymentArgs = {
  holdId: string;
  provider: string; // "stripe" | "webpay" | "fintoc" | "transfer" | ...
};

type PreparePaymentResult = {
  payment: any | null;
  amountCLP: number;
  eventId: string;
};

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function normalizeEmail(v: string) {
  return String(v || "").trim().toLowerCase();
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

/* =========================
   ✅ PREPARE PAYMENT (PG)
   - 1 pago por hold (UNIQUE hold_id)
   - calcula amount_clp desde hold_items
   - idempotente
   ========================= */

export async function preparePaymentForHoldPg(args: PreparePaymentArgs): Promise<PreparePaymentResult> {
  const holdId = String(args.holdId ?? "").trim();
  const provider = String(args.provider ?? "").trim();
  if (!holdId) throw new Error("Falta holdId.");
  if (!provider) throw new Error("Falta provider.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await releaseExpiredHoldsTx(client);

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
    const status = String(hold.status || "").toUpperCase();

    if (status !== "ACTIVE") {
      throw new Error(`Hold no está activo (${status}).`);
    }

    if (hold.expires_at && new Date(hold.expires_at).getTime() <= Date.now()) {
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

    const eventId = String(hold.event_id ?? "").trim();
    if (!eventId) throw new Error("Hold sin event_id.");

    const amountRes = await client.query<{ amount: number }>(
      `
      SELECT COALESCE(SUM((unit_price_clp::int) * (qty::int)), 0)::int AS amount
      FROM hold_items
      WHERE hold_id = $1
      `,
      [holdId]
    );

    const amountCLP = Number(amountRes.rows?.[0]?.amount ?? 0) || 0;
    if (amountCLP <= 0) throw new Error("Hold sin monto (hold_items vacío o precios inválidos).");

    const eventTitle = "";

    const newPaymentId = makeId("pay");

    const payRes = await client.query(
      `
      INSERT INTO payments (
        id, provider, provider_ref,
        buyer_email, buyer_name, owner_email,
        amount_clp, currency,
        status,
        created_at, updated_at,
        paid_at,
        hold_id, order_id,
        event_id, event_title
      )
      VALUES (
        $1, $2, NULL,
        NULL, NULL, NULL,
        $3, 'CLP',
        'CREATED',
        NOW(), NOW(),
        NULL,
        $4, NULL,
        $5, $6
      )
      ON CONFLICT (hold_id) DO UPDATE
      SET
        provider = CASE
          WHEN UPPER(payments.status) IN ('CREATED','PENDING') THEN EXCLUDED.provider
          ELSE payments.provider
        END,
        amount_clp = CASE
          WHEN UPPER(payments.status) IN ('CREATED','PENDING') THEN EXCLUDED.amount_clp
          ELSE payments.amount_clp
        END,
        currency = CASE
          WHEN UPPER(payments.status) IN ('CREATED','PENDING') THEN EXCLUDED.currency
          ELSE payments.currency
        END,
        event_id = COALESCE(NULLIF(payments.event_id,''), EXCLUDED.event_id),
        event_title = COALESCE(NULLIF(payments.event_title,''), EXCLUDED.event_title),
        updated_at = NOW()
      RETURNING *
      `,
      [newPaymentId, provider, amountCLP, holdId, eventId, eventTitle]
    );

    const payment = payRes.rows?.[0] ?? null;

    await client.query("COMMIT");
    return { payment, amountCLP, eventId };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export const preparePaymentForHoldPgServer = preparePaymentForHoldPg;

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
 * REAL: llamado por webhook/return cuando el pago está confirmado.
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
// Core (idempotente)
// -------------------------
async function finalizeHoldToOrderCoreTx(
  client: any,
  input: ConsumeArgs & {
    requirePaidPayment: boolean;
    paymentId: string | null;
  }
): Promise<{ order: any; tickets: any[] }> {
  const { holdId } = input;

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

  // ---- pagos reales: exige payment PAID, y aquí sacamos owner/recipient + datos comprador
  let ownerEmailFromPayment = "";
  let recipientEmailFromPayment = "";
  let buyerNameFromPayment = "";

  // Campos extra (si existen en DB)
  let buyerRutFromPayment = "";
  let buyerPhoneFromPayment = "";
  let buyerRegionFromPayment = "";
  let buyerComunaFromPayment = "";
  let buyerAddress1FromPayment = "";
  let buyerAddress2FromPayment = "";

  if (input.requirePaidPayment) {
    // Nota: si aún no migraste la DB con buyer_rut/etc, este SELECT fallaría.
    // Para no reventar entornos viejos, intentamos primero con columnas nuevas y
    // si falla, caemos a SELECT antiguo.
    let payRes: any;
    try {
      payRes = await client.query(
        `
        SELECT
          id, status, order_id,
          owner_email, buyer_email, buyer_name,
          buyer_rut, buyer_phone,
          buyer_region, buyer_comuna,
          buyer_address1, buyer_address2
        FROM payments
        WHERE hold_id = $1
          AND ($2::text IS NULL OR id = $2::text)
        FOR UPDATE
        `,
        [holdId, input.paymentId]
      );
    } catch (err) {
      payRes = await client.query(
        `
        SELECT id, status, order_id, owner_email, buyer_email, buyer_name
        FROM payments
        WHERE hold_id = $1
          AND ($2::text IS NULL OR id = $2::text)
        FOR UPDATE
        `,
        [holdId, input.paymentId]
      );
    }

    if (payRes.rowCount === 0) {
      throw new Error("No existe payment para este hold (o paymentId no coincide).");
    }

    const p = payRes.rows[0];
    if (String(p.status).toUpperCase() !== "PAID") {
      throw new Error(`Payment no está PAID (status=${p.status}).`);
    }

    ownerEmailFromPayment = normalizeEmail(p.owner_email || "");
    recipientEmailFromPayment = normalizeEmail(p.buyer_email || "");
    buyerNameFromPayment = String(p.buyer_name || "").trim();

    buyerRutFromPayment = String(p.buyer_rut || "").trim();
    buyerPhoneFromPayment = String(p.buyer_phone || "").trim();
    buyerRegionFromPayment = String(p.buyer_region || "").trim();
    buyerComunaFromPayment = String(p.buyer_comuna || "").trim();
    buyerAddress1FromPayment = String(p.buyer_address1 || "").trim();
    buyerAddress2FromPayment = String(p.buyer_address2 || "").trim();
  }

  // recipient = correo escrito en checkout
  const recipientEmail = normalizeEmail(
    input.requirePaidPayment ? (recipientEmailFromPayment || input.buyerEmail) : input.buyerEmail
  );

  // owner = correo de la cuenta logueada (si no existe, cae al mismo recipient)
  const ownerEmail = normalizeEmail(
    input.requirePaidPayment ? (ownerEmailFromPayment || recipientEmail) : recipientEmail
  );

  const buyerNameFinal =
    (input.requirePaidPayment ? buyerNameFromPayment : input.buyerName).trim() || input.buyerName.trim();

  const itemsRes = await client.query(
    `
    SELECT ticket_type_id, ticket_type_name, unit_price_clp, qty
    FROM hold_items
    WHERE hold_id = $1
    `,
    [holdId]
  );
  if (itemsRes.rowCount === 0) throw new Error("Hold no tiene items.");

  // Order idempotente por hold_id
  const newOrderId = makeId("ord");

  // Solo persistimos los campos extra si el pago es real (PAID) y si vienen desde payments.
  const buyerRutFinal = input.requirePaidPayment ? buyerRutFromPayment : "";
  const buyerPhoneFinal = input.requirePaidPayment ? buyerPhoneFromPayment : "";
  const buyerRegionFinal = input.requirePaidPayment ? buyerRegionFromPayment : "";
  const buyerComunaFinal = input.requirePaidPayment ? buyerComunaFromPayment : "";
  const buyerAddress1Final = input.requirePaidPayment ? buyerAddress1FromPayment : "";
  const buyerAddress2Final = input.requirePaidPayment ? buyerAddress2FromPayment : "";

  // Igual que con payments: si la DB no tiene columnas nuevas en orders, hacemos fallback.
  let orderRes: any;
  try {
    orderRes = await client.query(
      `
      INSERT INTO orders (
        id, hold_id, event_id, event_title,
        buyer_name, buyer_email, owner_email,
        buyer_rut, buyer_phone,
        buyer_region, buyer_comuna,
        buyer_address1, buyer_address2,
        created_at
      )
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9,
        $10, $11,
        $12, $13,
        NOW()
      )
      ON CONFLICT (hold_id) DO UPDATE
        SET buyer_email    = EXCLUDED.buyer_email,
            buyer_name     = EXCLUDED.buyer_name,
            owner_email    = EXCLUDED.owner_email,
            buyer_rut      = EXCLUDED.buyer_rut,
            buyer_phone    = EXCLUDED.buyer_phone,
            buyer_region   = EXCLUDED.buyer_region,
            buyer_comuna   = EXCLUDED.buyer_comuna,
            buyer_address1 = EXCLUDED.buyer_address1,
            buyer_address2 = EXCLUDED.buyer_address2
      RETURNING *
      `,
      [
        newOrderId,
        holdId,
        hold.event_id,
        input.eventTitle,
        buyerNameFinal,
        recipientEmail,
        ownerEmail,
        buyerRutFinal,
        buyerPhoneFinal,
        buyerRegionFinal,
        buyerComunaFinal,
        buyerAddress1Final,
        buyerAddress2Final,
      ]
    );
  } catch (err) {
    orderRes = await client.query(
      `
      INSERT INTO orders (id, hold_id, event_id, event_title, buyer_name, buyer_email, owner_email, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (hold_id) DO UPDATE
        SET buyer_email = EXCLUDED.buyer_email,
            buyer_name  = EXCLUDED.buyer_name,
            owner_email = EXCLUDED.owner_email
      RETURNING *
      `,
      [newOrderId, holdId, hold.event_id, input.eventTitle, buyerNameFinal, recipientEmail, ownerEmail]
    );
  }

  const order = orderRes.rows[0];

  await client.query(
    `
    UPDATE payments
    SET order_id = COALESCE(order_id, $2),
        updated_at = NOW()
    WHERE hold_id = $1
    `,
    [holdId, order.id]
  );

  const existingTickets = await client.query(
    `SELECT * FROM tickets WHERE order_id = $1 ORDER BY created_at ASC`,
    [order.id]
  );
  if (existingTickets.rowCount > 0) {
    return { order, tickets: existingTickets.rows };
  }

  await client.query(`UPDATE holds SET status='CONSUMED' WHERE id=$1`, [holdId]);

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

  const tickets: any[] = [];
  for (const it of itemsRes.rows) {
    for (let i = 0; i < Number(it.qty); i++) {
      const ticketId = makeId("tix");
      const tRes = await client.query(
        `
        INSERT INTO tickets (
          id, order_id, event_id, ticket_type_id, ticket_type_name,
          buyer_email, owner_email, status, created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,'VALID',NOW())
        RETURNING *
        `,
        [ticketId, order.id, hold.event_id, it.ticket_type_id, it.ticket_type_name, recipientEmail, ownerEmail]
      );
      tickets.push(tRes.rows[0]);
    }
  }

  return { order, tickets };
}
