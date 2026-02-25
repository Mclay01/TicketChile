// apps/web/src/app/api/organizador/admin/bootstrap/route.ts
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/organizer-auth.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, data: any) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function requireAdminKey(req: Request) {
  const expected = String(process.env.ORGANIZER_ADMIN_KEY || "").trim();
  if (!expected) throw new Error("Missing env ORGANIZER_ADMIN_KEY.");

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
    requireAdminKey(req);

    const body = await req.json().catch(() => ({}));
    const usernameRaw = pickString(body?.username);
    const password = pickString(body?.password);
    const displayName = pickString(body?.displayName) || null;

    const username = usernameRaw.toLowerCase();

    if (!username || username.length < 3) {
      return json(400, { ok: false, error: "username inválido (mín 3 chars)." });
    }
    if (!password || password.length < 6) {
      return json(400, { ok: false, error: "password inválido (mín 6 chars)." });
    }

    // Si ya existe, corta
    const exists = await pool.query<{ id: string }>(
      `SELECT id FROM organizer_users WHERE username=$1 LIMIT 1`,
      [username]
    );
    if (exists.rows?.[0]?.id) {
      return json(409, { ok: false, error: "Ese username ya existe." });
    }

    const id = "org_" + randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password);

    await pool.query(
      `
      INSERT INTO organizer_users (id, username, display_name, password_hash, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, true, NOW(), NOW())
      `,
      [id, username, displayName, passwordHash]
    );

    return json(200, { ok: true, id, username, displayName });
  } catch (err: any) {
    const status = Number(err?.status) || 500;
    return json(status, { ok: false, error: String(err?.message || "Error") });
  }
}