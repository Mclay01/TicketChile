// apps/web/src/app/api/demo/event-checkins/route.ts
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
    return NextResponse.json({ ok: false, error: "Falta eventId." }, { status: 400 });
  }

  const r = await pool.query(
    `
    SELECT id, ticket_type_name, buyer_email, used_at
    FROM tickets
    WHERE event_id = $1 AND status='USED'
    ORDER BY used_at DESC
    LIMIT 20
    `,
    [eventId]
  );

  return NextResponse.json(
    {
      ok: true,
      checkins: r.rows.map((x) => ({
        ticketId: x.id,
        ticketTypeName: x.ticket_type_name,
        buyerEmail: x.buyer_email,
        usedAtISO: x.used_at ? new Date(x.used_at).toISOString() : null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
