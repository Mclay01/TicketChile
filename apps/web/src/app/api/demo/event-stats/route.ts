// apps/web/src/app/api/demo/event-stats/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const eventId = pickString(searchParams.get("eventId"));
  if (!eventId) {
    return NextResponse.json(
      { ok: false, error: "Falta eventId." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Por tipo: usa contadores ticket_types para sold/held/capacity/remaining
  // y cuenta tickets para pending/used (status).
  const byTypeRes = await pool.query(
    `
    SELECT
      tt.id AS "ticketTypeId",
      tt.name AS "ticketTypeName",
      tt.capacity::int AS "capacity",
      tt.sold::int AS "sold",
      tt.held::int AS "held",
      GREATEST(tt.capacity - tt.sold - tt.held, 0)::int AS "remaining",
      COUNT(t.*) FILTER (WHERE t.status='VALID')::int AS "pending",
      COUNT(t.*) FILTER (WHERE t.status='USED')::int AS "used"
    FROM ticket_types tt
    LEFT JOIN tickets t
      ON t.event_id = tt.event_id AND t.ticket_type_id = tt.id
    WHERE tt.event_id = $1
    GROUP BY tt.id, tt.name, tt.capacity, tt.sold, tt.held
    ORDER BY tt.name ASC
    `,
    [eventId]
  );

  // Totales desde ticket_types (rápido y consistente con counters)
  const totalsRes = await pool.query(
    `
    SELECT
      COALESCE(SUM(capacity),0)::int AS capacity,
      COALESCE(SUM(sold),0)::int AS sold,
      COALESCE(SUM(held),0)::int AS held
    FROM ticket_types
    WHERE event_id = $1
    `,
    [eventId]
  );

  // Pending/Used desde tickets (porque status vive ahí)
  const statusRes = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE status='VALID')::int AS pending,
      COUNT(*) FILTER (WHERE status='USED')::int AS used
    FROM tickets
    WHERE event_id = $1
    `,
    [eventId]
  );

  const totalsBase = totalsRes.rows[0] ?? { capacity: 0, sold: 0, held: 0 };
  const status = statusRes.rows[0] ?? { pending: 0, used: 0 };
  const remaining = Math.max((totalsBase.capacity ?? 0) - (totalsBase.sold ?? 0) - (totalsBase.held ?? 0), 0);

  // Últimos usados (para el panel)
  const recentUsedRes = await pool.query(
    `
    SELECT
      id AS "ticketId",
      ticket_type_name AS "ticketTypeName",
      buyer_email AS "buyerEmail",
      used_at
    FROM tickets
    WHERE event_id = $1 AND status='USED'
    ORDER BY used_at DESC
    LIMIT 10
    `,
    [eventId]
  );

  return NextResponse.json(
    {
      ok: true,
      eventId,
      totals: {
        capacity: totalsBase.capacity,
        sold: totalsBase.sold,
        held: totalsBase.held,
        remaining,
        pending: status.pending,
        used: status.used,
      },
      byType: byTypeRes.rows,
      recentUsed: recentUsedRes.rows.map((r: any) => ({
        ticketId: r.ticketId,
        ticketTypeName: r.ticketTypeName,
        buyerEmail: r.buyerEmail,
        usedAtISO: r.used_at ? new Date(r.used_at).toISOString() : null,
      })),
      soldOut: remaining <= 0,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
