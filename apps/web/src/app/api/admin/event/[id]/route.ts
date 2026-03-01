// apps/web/src/app/api/admin/event/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { adminGetEventDb } from "@/lib/events.admin.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const event = await adminGetEventDb(String(id));
  if (!event) return NextResponse.json({ ok: false, error: "No existe." }, { status: 404 });
  return NextResponse.json({ ok: true, event });
}