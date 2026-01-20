// apps/web/src/app/api/demo/tickets/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const emailRaw = String(searchParams.get("email") ?? "").trim();

  // tu UI manda "@" como placeholder a veces
  if (!emailRaw || emailRaw === "@" || !emailRaw.includes("@")) {
    return NextResponse.json({ ok: true, tickets: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const email = emailRaw.toLowerCase();

  const r = await pool.query(
    `
    SELECT
      t.id,
      t.order_id,
      t.event_id,
      t.ticket_type_id,
      t.ticket_type_name,
      t.buyer_email,
      t.status,
      t.created_at,
      o.event_title
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    WHERE LOWER(t.buyer_email) = $1
    ORDER BY t.created_at DESC
    LIMIT 200
    `,
    [email]
  );

  const tickets = r.rows.map((x: any) => ({
    id: x.id,
    orderId: x.order_id,
    eventId: x.event_id,
    eventTitle: x.event_title,
    ticketTypeId: x.ticket_type_id,
    ticketTypeName: x.ticket_type_name,
    buyerEmail: x.buyer_email,
    status: x.status,
    createdAtISO: x.created_at,
  }));

  return NextResponse.json({ ok: true, tickets }, { headers: { "Cache-Control": "no-store" } });
}
