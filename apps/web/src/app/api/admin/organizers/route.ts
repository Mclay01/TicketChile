// apps/web/src/app/api/admin/organizers/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // pending | approved

  const where =
    status === "approved"
      ? "WHERE approved = true"
      : "WHERE verified = true AND approved = false";

  const r = await pool.query(
    `
    SELECT id, username, display_name, email, phone, verified, approved, created_at
    FROM organizer_users
    ${where}
    ORDER BY created_at DESC
    `
  );

  return NextResponse.json({ ok: true, organizers: r.rows ?? [] });
}