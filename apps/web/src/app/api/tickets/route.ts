import { limit } from "@/lib/security/rate-limit.server";
import { accessResponse } from "@/lib/access.server";
import { NextResponse } from "next/server";
import { getBuyerEmail, TICKET_OWNER_SQL } from "@/lib/buyer-guard.server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ownerEmail = await getBuyerEmail();

  if (!ownerEmail) {
    return NextResponse.json(
      { ok: false, error: "No autenticado." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {await limit("ticket-read",ownerEmail,{hits:600,seconds:60});}catch(error){return accessResponse(error);}
  // Seguridad: ignoramos el query param email (evita que alguien consulte tickets ajenos)
  // La sesión manda.
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT
        t.id,
        t.order_id        AS "orderId",
        t.event_id        AS "eventId",
        o.event_title     AS "eventTitle",
        t.ticket_type_name AS "ticketTypeName",
        t.ticket_type_id AS "ticketTypeId",
        t.created_at AS "createdAtISO",
        t.buyer_email     AS "buyerEmail",
        t.status
      FROM tickets t
      JOIN orders o ON o.id = t.order_id
      WHERE ${TICKET_OWNER_SQL} = $1
      ORDER BY t.created_at DESC
      `,
      [ownerEmail]
    );

    return NextResponse.json(
      { ok: true, tickets: rows },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "No se pudieron cargar tus entradas." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    client.release();
  }
}
