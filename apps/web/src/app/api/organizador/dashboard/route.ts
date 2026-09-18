import { NextResponse } from "next/server";
import { requireOrganizerApproved } from "@/lib/organizer-guard.server";
import { getOrganizerDashboardStatsPgServerByOrganizer } from "@/lib/organizer.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireOrganizerApproved();
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: "No autorizado.", reason: gate.reason },
      { status: gate.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  const statsByEvent = await getOrganizerDashboardStatsPgServerByOrganizer(gate.organizerId);

  return NextResponse.json(
    { ok: true, statsByEvent, nowISO: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
