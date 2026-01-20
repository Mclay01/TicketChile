// apps/web/src/lib/availability.pg.server.ts
import { pool } from "@/lib/db";

export type AvailabilityByType = {
  ticketTypeId: string;
  ticketTypeName: string;
  capacity: number;
  sold: number;
  held: number;
  remaining: number;
};

export type AvailabilityStats = {
  eventId: string;
  totals: {
    capacity: number;
    sold: number;
    held: number;
    remaining: number;
    used: number;
  };
  byType: AvailabilityByType[];
  recentUsed: { ticketId: string; ticketTypeName: string; buyerEmail: string; usedAtISO: string }[];
  soldOut: boolean;
};

async function expireHoldsAndReleaseHeldTx(client: any) {
  // Expira holds y libera held en una sola pasada (set-based).
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

export async function getEventAvailabilityPgServer(eventId: string): Promise<AvailabilityStats> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Para que "held" no quede pegado si nadie compra/consume después del TTL.
    await expireHoldsAndReleaseHeldTx(client);

    const ev = await client.query(`SELECT id FROM events WHERE id=$1`, [eventId]);
    if (ev.rowCount === 0) throw new Error("Evento no existe.");

    const ttRes = await client.query(
      `
      SELECT id, name, capacity, sold, held
      FROM ticket_types
      WHERE event_id = $1
      ORDER BY name ASC
      `,
      [eventId]
    );

    const byType: AvailabilityByType[] = ttRes.rows.map((r: any) => {
      const capacity = Number(r.capacity) || 0;
      const sold = Number(r.sold) || 0;
      const held = Number(r.held) || 0;
      const remaining = Math.max(capacity - sold - held, 0);
      return {
        ticketTypeId: String(r.id),
        ticketTypeName: String(r.name),
        capacity,
        sold,
        held,
        remaining,
      };
    });

    const totals = byType.reduce(
      (acc, x) => {
        acc.capacity += x.capacity;
        acc.sold += x.sold;
        acc.held += x.held;
        acc.remaining += x.remaining;
        return acc;
      },
      { capacity: 0, sold: 0, held: 0, remaining: 0, used: 0 }
    );

    const usedRes = await client.query(
      `SELECT COUNT(*)::int AS used FROM tickets WHERE event_id=$1 AND status='USED'`,
      [eventId]
    );
    totals.used = usedRes.rows?.[0]?.used ?? 0;

    const recentUsedRes = await client.query(
      `
      SELECT id AS "ticketId", ticket_type_name AS "ticketTypeName", buyer_email AS "buyerEmail",
             used_at::timestamptz AS "usedAt"
      FROM tickets
      WHERE event_id=$1 AND status='USED' AND used_at IS NOT NULL
      ORDER BY used_at DESC
      LIMIT 10
      `,
      [eventId]
    );

    const recentUsed = recentUsedRes.rows.map((r: any) => ({
      ticketId: String(r.ticketId),
      ticketTypeName: String(r.ticketTypeName),
      buyerEmail: String(r.buyerEmail),
      usedAtISO: new Date(r.usedAt).toISOString(),
    }));

    await client.query("COMMIT");

    return {
      eventId,
      totals,
      byType,
      recentUsed,
      soldOut: totals.remaining <= 0,
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
