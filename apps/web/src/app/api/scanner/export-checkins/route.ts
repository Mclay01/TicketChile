import { NextResponse } from "next/server";
import { exportCheckinsCsvPgServer } from "@/lib/event-export.server";
import { accessResponse } from "@/lib/access.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams;
    const eventId = sp.get("eventId") || "";
    const status = sp.get("status");
    const csv = await exportCheckinsCsvPgServer({
      eventId, status: status === "VALID" || status === "USED" ? status : "ALL",
      ticketTypeId: sp.get("ticketTypeId") || undefined,
      fromISO: sp.get("from") || undefined, toISO: sp.get("to") || undefined,
      dateField: sp.get("dateField") === "usedAt" ? "usedAt" : "createdAt",
    });
    return new NextResponse(csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="event_${eventId.replace(/[^a-zA-Z0-9_-]/g, "_")}_export-checkins.csv"`,
    } });
  } catch (error) { return accessResponse(error); }
}
