import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(v: unknown) {
  return String(v || "").trim().toLowerCase();
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const ownerEmail = normalizeEmail(session?.user?.email);

  if (!ownerEmail) {
    return NextResponse.json(
      { ok: false, error: "No autenticado." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

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
        t.buyer_email     AS "buyerEmail",
        t.status
      FROM tickets t
      JOIN orders o ON o.id = t.order_id
      WHERE COALESCE(t.owner_email, o.owner_email, o.buyer_email, t.buyer_email) = $1
      ORDER BY t.created_at DESC
      `,
      [ownerEmail]
    );

    return NextResponse.json(
      { ok: true, tickets: rows },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    client.release();
  }
}
