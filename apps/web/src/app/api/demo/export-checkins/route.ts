import { NextResponse } from "next/server";
import { exportCheckinsCsvPgServer } from "@/lib/organizer.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function requireExportAuth(req: Request, sp: URLSearchParams) {
  const secret = process.env.TICKETCHILE_EXPORT_SECRET;
  if (!secret) return null;

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

  const key = pickString(sp.get("key"));
  if (bearer === secret || key === secret) return null;

  return NextResponse.json({ ok: false, error: "No autorizado (export)." }, { status: 401 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const authErr = requireExportAuth(req, searchParams);
  if (authErr) return authErr;

  const eventId = pickString(searchParams.get("eventId"));
  if (!eventId) return NextResponse.json({ ok: false, error: "Falta eventId." }, { status: 400 });

  const ticketTypeId = pickString(searchParams.get("ticketTypeId"));
  const from = pickString(searchParams.get("from"));
  const to = pickString(searchParams.get("to"));

  const csv = await exportCheckinsCsvPgServer({
    eventId,
    ticketTypeId: ticketTypeId || undefined,
    fromISO: from || undefined,
    toISO: to || undefined,
    includeBom: true,
  });

  const safeEvent = eventId.replace(/[^a-zA-Z0-9_\-]/g, "_");
  const filename = `event_${safeEvent}_checkins.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
