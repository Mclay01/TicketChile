import { pool } from "@/lib/db";
import crypto from "node:crypto";

type HoldItemCanon = {
  ticketTypeId: string;
  ticketTypeName: string;
  unitPriceCLP: number;
  qty: number;
};

export type Hold = {
  id: string;
  createdAtISO: string;
  expiresAtISO: string;
  eventId: string;
  status: "ACTIVE" | "EXPIRED" | "CONSUMED";
  items: HoldItemCanon[];
};

function newId(prefix: string) {
  const a = Date.now().toString(36);
  const b = crypto.randomBytes(4).toString("hex");
  return `${prefix}_${a}_${b}`;
}

async function expireHoldsTx(client: any) {
  // 1) marca expirados
  const expired = await client.query(
    `
    WITH expired AS (
      UPDATE holds
      SET status = 'EXPIRED'
      WHERE status = 'ACTIVE' AND expires_at < NOW()
      RETURNING id
    )
    SELECT id FROM expired
    `
  );

  const ids: string[] = expired.rows.map((r: any) => r.id);
  if (ids.length === 0) return;

  // 2) descuenta held en ticket_types
  const sums = await client.query(
    `
    SELECT event_id, ticket_type_id, SUM(qty)::int AS qty
    FROM hold_items
    WHERE hold_id = ANY($1)
    GROUP BY event_id, ticket_type_id
    `,
    [ids]
  );

  for (const row of sums.rows) {
    await client.query(
      `
      UPDATE ticket_types
      SET held = GREATEST(held - $3, 0)
      WHERE event_id = $1 AND id = $2
      `,
      [row.event_id, row.ticket_type_id, row.qty]
    );
  }
}

export async function createHoldPgServer(args: {
  eventId: string;
  requested: { ticketTypeId: string; qty: number }[];
  ttlSeconds: number;
}): Promise<{ hold: Hold }> {
  const { eventId } = args;

  // clamp TTL razonable
  const ttlSeconds = Math.max(60, Math.min(60 * 60, Math.floor(args.ttlSeconds || 480)));

  // colapsar duplicados por ticketTypeId
  const byId = new Map<string, number>();
  for (const r of args.requested) {
    byId.set(r.ticketTypeId, (byId.get(r.ticketTypeId) || 0) + r.qty);
  }
  const requested = [...byId.entries()].map(([ticketTypeId, qty]) => ({ ticketTypeId, qty }));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // limpieza: expira holds y libera held
    await expireHoldsTx(client);

    // validar evento existe
    const ev = await client.query(`SELECT id FROM events WHERE id = $1`, [eventId]);
    if (ev.rowCount === 0) {
      await client.query("ROLLBACK");
      throw new Error("Evento no existe.");
    }

    const ids = requested.map((x) => x.ticketTypeId);

    // lock rows para evitar sobreventa
    const ttRes = await client.query(
      `
      SELECT id, name, price_clp, capacity, sold, held
      FROM ticket_types
      WHERE event_id = $1 AND id = ANY($2)
      FOR UPDATE
      `,
      [eventId, ids]
    );

    if (ttRes.rowCount !== ids.length) {
      await client.query("ROLLBACK");
      throw new Error("TicketType inválido (uno o más).");
    }

    const ttById = new Map<string, any>();
    for (const row of ttRes.rows) ttById.set(row.id, row);

    const items: HoldItemCanon[] = requested.map((r) => {
      const row = ttById.get(r.ticketTypeId);
      return {
        ticketTypeId: row.id,
        ticketTypeName: row.name,
        unitPriceCLP: Number(row.price_clp),
        qty: r.qty,
      };
    });

    // validar stock
    for (const it of items) {
      const row = ttById.get(it.ticketTypeId);
      const remaining = Math.max(Number(row.capacity) - Number(row.sold) - Number(row.held), 0);

      if (it.qty > remaining) {
        await client.query("ROLLBACK");
        throw new Error(`Stock insuficiente para "${it.ticketTypeName}". Quedan ${remaining}.`);
      }
      if (!Number.isFinite(it.unitPriceCLP) || it.unitPriceCLP <= 0) {
        await client.query("ROLLBACK");
        throw new Error(`Precio inválido para "${it.ticketTypeName}".`);
      }
    }

    const holdId = newId("hold");
    const created = new Date();
    const expires = new Date(created.getTime() + ttlSeconds * 1000);

    await client.query(
      `
      INSERT INTO holds (id, event_id, status, created_at, expires_at)
      VALUES ($1, $2, 'ACTIVE', $3, $4)
      `,
      [holdId, eventId, created.toISOString(), expires.toISOString()]
    );

    for (const it of items) {
      await client.query(
        `
        INSERT INTO hold_items (hold_id, event_id, ticket_type_id, ticket_type_name, unit_price_clp, qty)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [holdId, eventId, it.ticketTypeId, it.ticketTypeName, it.unitPriceCLP, it.qty]
      );

      await client.query(
        `
        UPDATE ticket_types
        SET held = held + $3
        WHERE event_id = $1 AND id = $2
        `,
        [eventId, it.ticketTypeId, it.qty]
      );
    }

    await client.query("COMMIT");

    return {
      hold: {
        id: holdId,
        createdAtISO: created.toISOString(),
        expiresAtISO: expires.toISOString(),
        eventId,
        status: "ACTIVE",
        items,
      },
    };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}
