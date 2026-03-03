import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/organizer-auth.pg.server";
import { getAdminFromSession } from "@/lib/admin-auth.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, data: any) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function requireAdmin(req: Request) {
  // ✅ 1) admin session (si estás logueado al panel admin)
  const ck = await cookies();
  const sid = ck.get("tc_admin_sess")?.value || "";
  if (sid && sid.trim().length > 10) {
    const admin = await getAdminFromSession(sid);
    if (admin) return;
  }

  // ✅ 2) fallback: header key (para scripts/server-to-server)
  const expected = String(process.env.ORGANIZER_ADMIN_KEY || "").trim();
  if (!expected) {
    const e: any = new Error("Missing env ORGANIZER_ADMIN_KEY.");
    e.status = 500;
    throw e;
  }

  const got = String(req.headers.get("x-organizer-admin-key") || "").trim();
  if (!got || got !== expected) {
    const e: any = new Error("Unauthorized.");
    e.status = 401;
    throw e;
  }
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const usernameRaw = pickString(body?.username);
    const password = pickString(body?.password);
    const displayName = pickString(body?.displayName) || null;
    const email = pickString(body?.email).toLowerCase() || null;
    const phone = pickString(body?.phone) || null;

    const username = usernameRaw.toLowerCase();

    if (!username || username.length < 3) {
      return json(400, { ok: false, error: "username inválido (mín 3 chars)." });
    }
    if (!password || password.length < 8) {
      return json(400, { ok: false, error: "password inválido (mín 8 chars)." });
    }

    // evita duplicados por username/email/phone
    const exists = await pool.query<{ id: string }>(
      `
      SELECT id
      FROM organizer_users
      WHERE LOWER(username) = LOWER($1)
         OR ($2::text IS NOT NULL AND LOWER(email) = LOWER($2))
         OR ($3::text IS NOT NULL AND phone = $3)
      LIMIT 1
      `,
      [username, email, phone]
    );

    if (exists.rows?.[0]?.id) {
      return json(409, { ok: false, error: "Ya existe un organizador con esos datos." });
    }

    const id = "org_" + randomBytes(12).toString("hex");
    const passwordHash = hashPassword(password);

    // ✅ Admin-creado => verified=true y approved=true (ya está “aprobado” por definición)
    await pool.query(
      `
      INSERT INTO organizer_users
        (id, username, display_name, password_hash, email, phone, verified, approved, created_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, true, true, NOW())
      `,
      [id, username, displayName, passwordHash, email, phone]
    );

    return json(200, { ok: true, id, username, displayName, email, phone });
  } catch (err: any) {
    const status = Number(err?.status) || 500;
    return json(status, { ok: false, error: String(err?.message || "Error") });
  }
}