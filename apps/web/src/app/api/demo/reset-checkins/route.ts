// apps/web/src/app/api/demo/reset-checkins/route.ts
import { NextResponse } from "next/server";
import { resetCheckinsPgServer } from "@/lib/organizer.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const eventId = String(body?.eventId ?? "").trim();
  if (!eventId) return NextResponse.json({ ok: false, error: "Falta eventId." }, { status: 400 });

  const data = await resetCheckinsPgServer(eventId);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
