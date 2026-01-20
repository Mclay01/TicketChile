import { NextResponse } from "next/server";
import { getOrganizerDashboardStatsPgServer } from "@/lib/organizer.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const statsByEvent = await getOrganizerDashboardStatsPgServer();

  return NextResponse.json(
    { ok: true, statsByEvent, nowISO: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
