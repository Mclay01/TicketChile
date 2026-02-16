import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const eventId = (url.searchParams.get("eventId") ?? "").trim();

  if (!eventId) {
    return NextResponse.json({ ok: false, error: "eventId_missing" }, { status: 400 });
  }

  // capacity - sold - held
  const r = await pool.query(
    `
    SELECT id,
           capacity,
           sold,
           held
    FROM ticket_types
    WHERE event_id = $1
    `,
    [eventId]
  );

  const remainingByTicketTypeId: Record<string, number> = {};

  for (const row of r.rows) {
    const id = String(row.id);

    const cap =
      row.capacity === null || row.capacity === undefined ? null : Number(row.capacity);
    const sold = Number(row.sold ?? 0);
    const held = Number(row.held ?? 0);

    // Si capacity es null => sin límite (ponemos un número grande)
    if (cap === null || !Number.isFinite(cap) || cap <= 0) {
      remainingByTicketTypeId[id] = 999999;
    } else {
      remainingByTicketTypeId[id] = Math.max(0, cap - sold - held);
    }
  }

  return NextResponse.json({ ok: true, remainingByTicketTypeId });
}
