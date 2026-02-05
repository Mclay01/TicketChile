import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = String(searchParams.get("email") ?? "").trim().toLowerCase();

  if (!email) return json(400, { ok: false, error: "email requerido." });

  const client = await pool.connect();
  try {
    const tRes = await client.query(
      `
      SELECT
        id, order_id, event_id, ticket_type_name, buyer_email, status, created_at
      FROM tickets
      WHERE lower(buyer_email) = $1
      ORDER BY created_at DESC
      `,
      [email]
    );

    const tickets = tRes.rows.map((t: any) => ({
      id: String(t.id),
      orderId: String(t.order_id),
      eventId: String(t.event_id),
      ticketTypeName: String(t.ticket_type_name),
      buyerEmail: String(t.buyer_email),
      status: String(t.status),
      createdAtISO: t.created_at,
    }));

    return json(200, { ok: true, tickets });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message || e) });
  } finally {
    client.release();
  }
}
