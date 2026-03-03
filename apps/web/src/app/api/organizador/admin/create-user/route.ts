import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import crypto from "crypto";
import { hashPassword } from "@/lib/organizer-auth.pg.server";
import { getAdminFromSession } from "@/lib/admin-auth.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

async function requireAdmin(req: Request) {
  // 1) Admin session cookie
  const ck = await cookies();
  const sid = ck.get("tc_admin_sess")?.value || "";
  if (sid && sid.trim().length > 10) {
    const admin = await getAdminFromSession(sid);
    if (admin) return;
  }

  // 2) Fallback: header key
  const expected = String(process.env.ORGANIZER_ADMIN_KEY || "").trim();
  if (!expected) return { ok: false, status: 500, error: "Falta ORGANIZER_ADMIN_KEY en env." };

  const got = String(req.headers.get("x-organizer-admin-key") || "").trim();
  if (!got || got !== expected) return { ok: false, status: 401, error: "Unauthorized." };

  return { ok: true as const };
}

export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if ((gate as any)?.ok === false) {
    return NextResponse.json({ ok: false, error: (gate as any).error }, { status: (gate as any).status });
  }

  const ct = req.headers.get("content-type") || "";
  let username = "";
  let password = "";
  let displayName = "";
  let email = "";
  let phone = "";

  try {
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      username = pickString(body?.username);
      password = pickString(body?.password);
      displayName = pickString(body?.displayName);
      email = pickString(body?.email);
      phone = pickString(body?.phone);
    } else {
      const fd = await req.formData();
      username = pickString(fd.get("username"));
      password = pickString(fd.get("password"));
      displayName = pickString(fd.get("displayName"));
      email = pickString(fd.get("email"));
      phone = pickString(fd.get("phone"));
    }
  } catch {}

  username = username.toLowerCase();
  email = email.toLowerCase();

  if (!username || username.length < 3 || !password || password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Faltan campos o inválidos (username>=3, password>=8)." },
      { status: 400 }
    );
  }

  // evitar duplicados
  const dupe = await pool.query(
    `
    SELECT 1
    FROM organizer_users
    WHERE LOWER(username) = LOWER($1)
       OR ($2::text IS NOT NULL AND LOWER(email) = LOWER($2))
       OR ($3::text IS NOT NULL AND phone = $3)
    LIMIT 1
    `,
    [username, email || null, phone || null]
  );
  if (dupe.rowCount) {
    return NextResponse.json({ ok: false, error: "Ya existe un organizador con esos datos." }, { status: 409 });
  }

  const id = "org_" + crypto.randomBytes(12).toString("hex");
  const passwordHash = hashPassword(password);

  // Admin-creado => verified+approved true
  await pool.query(
    `
    INSERT INTO organizer_users
      (id, username, display_name, password_hash, email, phone, verified, approved, created_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, true, true, NOW())
    `,
    [id, username, displayName || null, passwordHash, email || null, phone || null]
  );

  return NextResponse.json({ ok: true, id, username });
}