// apps/web/src/app/api/admin/events/[id]/publish/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { adminSetPublishedDb } from "@/lib/events.admin.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await adminSetPublishedDb(String(id), true);
  return NextResponse.json({ ok: true });
}