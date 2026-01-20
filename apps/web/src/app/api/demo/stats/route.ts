import { NextResponse } from "next/server";
import { EVENTS } from "@/lib/events";
import { getTicketsServer, getSoldQtyForTicketType, getActiveHoldQtyForTicketType } from "@/lib/demo-db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getCapacity(tt: any): number {
  const n =
    tt?.capacity ??
    tt?.stock ??
    tt?.qty ??
    tt?.quantity ??
    tt?.maxQty ??
    tt?.limit ??
    0;

  return Number.isFinite(Number(n)) ? Number(n) : 0;
}

export async function GET() {
  const allTickets = getTicketsServer();

  const events = EVENTS.map((ev) => {
    const evTickets = allTickets.filter((t) => t.eventId === ev.id);
    const usedTotal = evTickets.filter((t) => t.status === "USED").length;

    const ticketTypes = (ev.ticketTypes as any[]).map((tt) => {
      const capacity = getCapacity(tt);
      const sold = getSoldQtyForTicketType(ev.id, tt.id, tt.name);
      const held = getActiveHoldQtyForTicketType(ev.id, tt.id);
      const remaining = Math.max(0, capacity - sold - held);
      const revenueCLP = sold * Number(tt.priceCLP || 0);
      const soldOut = remaining <= 0;

      return {
        id: tt.id,
        name: tt.name,
        priceCLP: Number(tt.priceCLP || 0),
        capacity,
        sold,
        held,
        remaining,
        revenueCLP,
        soldOut,
      };
    });

    const soldTotal = ticketTypes.reduce((a, t) => a + t.sold, 0);
    const remainingTotal = ticketTypes.reduce((a, t) => a + t.remaining, 0);
    const revenueTotalCLP = ticketTypes.reduce((a, t) => a + t.revenueCLP, 0);

    return {
      id: ev.id,
      title: (ev as any).title,
      slug: (ev as any).slug,
      city: (ev as any).city,
      venue: (ev as any).venue,
      dateISO: (ev as any).dateISO,

      soldTotal,
      usedTotal,
      remainingTotal,
      revenueTotalCLP,

      ticketTypes,
      updatedAtISO: new Date().toISOString(),
    };
  });

  return json(200, {
    ok: true,
    events,
    generatedAtISO: new Date().toISOString(),
  });
}
