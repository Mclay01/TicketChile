import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { pool } from "@/lib/db";
import { EVENTS } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();

  if (!email) {
    return json(401, { ok: false, error: "No autenticado." });
  }

  const titleByEventId = new Map(EVENTS.map((e) => [String(e.id), String(e.title)]));

  const r = await pool.query(
    `
    SELECT
      id, order_id, event_id, ticket_type_name, buyer_email, status
    FROM tickets
    WHERE LOWER(buyer_email) = $1
    ORDER BY created_at DESC
    `,
    [email]
  );

  const tickets = r.rows.map((t: any) => {
    const eventId = String(t.event_id);
    return {
      id: String(t.id),
      orderId: String(t.order_id),
      eventId,
      eventTitle: titleByEventId.get(eventId) || "",
      ticketTypeName: String(t.ticket_type_name || ""),
      buyerEmail: String(t.buyer_email || ""),
      status: String(t.status || "VALID"),
    };
  });

  return json(200, { ok: true, tickets });
}
