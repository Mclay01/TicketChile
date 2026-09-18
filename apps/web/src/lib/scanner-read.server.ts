import "server-only";
import { pool } from "@/lib/db";
import { requireEventAccess } from "@/lib/event-access.server";

export async function eventCheckins(eventId: string) {
  const access = await requireEventAccess(eventId);
  const result = await pool.query<{ id: string; ticket_type_name: string; used_at: Date }>(
    `SELECT t.id, t.ticket_type_name, t.used_at FROM tickets t
     WHERE t.event_id=$1 AND t.status='USED'
       AND EXISTS (SELECT 1 FROM organizer_events oe WHERE oe.event_id=t.event_id AND oe.organizer_id=$2)
     ORDER BY t.used_at DESC LIMIT 20`, [eventId, access.organizerId],
  );
  return result.rows.map(row => ({ id: row.id, ticketId: row.id, ticketTypeName: row.ticket_type_name,
    status: "USED", usedAtISO: row.used_at ? new Date(row.used_at).toISOString() : null }));
}

export async function eventStats(eventId: string) {
  const access = await requireEventAccess(eventId);
  type StatsRow = { ticketTypeId: string; ticketTypeName: string; capacity: number; sold: number; held: number; remaining: number; pending: number; used: number };
  const result = await pool.query<StatsRow>(
    `SELECT tt.id AS "ticketTypeId", tt.name AS "ticketTypeName", tt.capacity, tt.sold, tt.held,
            GREATEST(tt.capacity-tt.sold-tt.held,0)::int AS remaining,
            COUNT(t.id) FILTER (WHERE t.status='VALID')::int AS pending,
            COUNT(t.id) FILTER (WHERE t.status='USED')::int AS used
     FROM ticket_types tt LEFT JOIN tickets t ON t.event_id=tt.event_id AND t.ticket_type_id=tt.id
     WHERE tt.event_id=$1
       AND EXISTS (SELECT 1 FROM organizer_events oe WHERE oe.event_id=tt.event_id AND oe.organizer_id=$2)
     GROUP BY tt.id, tt.name, tt.capacity, tt.sold, tt.held ORDER BY tt.name`, [eventId, access.organizerId],
  );
  const totals = result.rows.reduce((total, row) => ({
    capacity: total.capacity + row.capacity, sold: total.sold + row.sold, held: total.held + row.held,
    remaining: total.remaining + row.remaining, pending: total.pending + row.pending, used: total.used + row.used,
  }), { capacity: 0, sold: 0, held: 0, remaining: 0, pending: 0, used: 0 });
  return { eventId, totals, byType: result.rows, soldOut: totals.remaining <= 0 };
}
