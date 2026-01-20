// apps/web/src/app/api/demo/availability/route.ts
import { NextResponse } from "next/server";
import { getEventAvailabilityPgServer } from "@/lib/availability.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const eventId = (searchParams.get("eventId") ?? "").trim();

  if (!eventId) {
    return NextResponse.json(
      { ok: false, error: "Falta eventId." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const stats = await getEventAvailabilityPgServer(eventId);

    const remainingByTicketTypeId: Record<string, number> = {};
    const soldByTicketTypeId: Record<string, number> = {};
    const heldByTicketTypeId: Record<string, number> = {};
    const capacityByTicketTypeId: Record<string, number> = {};

    for (const x of stats.byType ?? []) {
      remainingByTicketTypeId[x.ticketTypeId] = x.remaining;
      soldByTicketTypeId[x.ticketTypeId] = x.sold;
      heldByTicketTypeId[x.ticketTypeId] = x.held;
      capacityByTicketTypeId[x.ticketTypeId] = x.capacity;
    }

    return NextResponse.json(
      {
        ok: true,
        ...stats,
        remainingByTicketTypeId,
        soldByTicketTypeId,
        heldByTicketTypeId,
        capacityByTicketTypeId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    const msg = String(e?.message || e);
    const status = msg.includes("Evento no existe") ? 404 : 500;
    return NextResponse.json(
      { ok: false, error: msg },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
