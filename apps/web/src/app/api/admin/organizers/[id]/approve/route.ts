// apps/web/src/app/api/admin/organizers/[id]/approve/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  await pool.query(
    `UPDATE organizer_users SET approved = true WHERE id = $1`,
    [String(id)]
  );

  return NextResponse.json({ ok: true });
}