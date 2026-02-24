import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import crypto from "crypto";
import { hashPassword } from "@/lib/organizerAuth.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  const expected = String(process.env.ORGANIZER_ADMIN_KEY || "").trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Falta ORGANIZER_ADMIN_KEY en env." },
      { status: 500 }
    );
  }

  const ct = req.headers.get("content-type") || "";
  let adminKey = "";
  let username = "";
  let password = "";
  let displayName = "";

  try {
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      adminKey = pickString(body?.adminKey);
      username = pickString(body?.username);
      password = pickString(body?.password);
      displayName = pickString(body?.displayName);
    } else {
      const fd = await req.formData();
      adminKey = pickString(fd.get("adminKey"));
      username = pickString(fd.get("username"));
      password = pickString(fd.get("password"));
      displayName = pickString(fd.get("displayName"));
    }
  } catch {}

  if (adminKey !== expected) {
    return NextResponse.json({ ok: false, error: "Admin key inválida." }, { status: 401 });
  }

  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "Faltan username/password." }, { status: 400 });
  }

  const id = "org_" + crypto.randomBytes(12).toString("hex");
  const passwordHash = hashPassword(password);

  await pool.query(
    `
    INSERT INTO organizer_accounts (id, username, password_hash, display_name)
    VALUES ($1, $2, $3, $4)
    `,
    [id, username, passwordHash, displayName || null]
  );

  return NextResponse.json({ ok: true, id, username });
}