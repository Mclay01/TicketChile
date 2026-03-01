// apps/web/src/app/api/admin/bootstrap/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/admin-auth.pg.server";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const key = String(req.headers.get("x-bootstrap-key") || "").trim();
  const expected = String(process.env.ADMIN_BOOTSTRAP_KEY || "").trim();

  if (!expected || key !== expected) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const username = String(process.env.ADMIN_BOOTSTRAP_USER || "").trim().toLowerCase();
  const pass = String(process.env.ADMIN_BOOTSTRAP_PASS || "");

  if (!username || !pass) {
    return NextResponse.json({ ok: false, error: "Falta ADMIN_BOOTSTRAP_USER/PASS." }, { status: 400 });
  }

  const exists = await pool.query(`SELECT 1 FROM admin_users WHERE username = $1 LIMIT 1`, [username]);
  if (exists.rowCount) {
    return NextResponse.json({ ok: true, message: "Admin ya existe.", username });
  }

  const id = "adm_" + randomBytes(12).toString("hex");
  const password_hash = hashPassword(pass);

  await pool.query(
    `INSERT INTO admin_users (id, username, display_name, password_hash) VALUES ($1, $2, $3, $4)`,
    [id, username, "Admin", password_hash]
  );

  return NextResponse.json({ ok: true, id, username });
}