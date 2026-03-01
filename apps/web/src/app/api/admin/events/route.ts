// apps/web/src/app/api/admin/events/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { adminListEventsDb } from "@/lib/events.admin.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab"); // "pending" | "published" | null

  const published =
    tab === "pending" ? false : tab === "published" ? true : undefined;

  const events = await adminListEventsDb({ published });
  return NextResponse.json({ ok: true, events });
}