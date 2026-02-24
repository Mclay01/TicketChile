import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyPassword, signOrganizerIdCookieValue } from "@/lib/organizerAuth.server";

const COOKIE_NAME = "tc_org";
const ORG_USER_COOKIE = "tc_org_user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  const expected = String(process.env.ORGANIZER_KEY || "").trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "ORGANIZER_KEY no está configurado" },
      { status: 500 }
    );
  }

  const ct = req.headers.get("content-type") || "";
  let key = "";
  let from = "/organizador";
  let username = "";
  let password = "";

  try {
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      key = pickString(body?.key);
      from = pickString(body?.from) || from;
      username = pickString(body?.username);
      password = pickString(body?.password);
    } else {
      const fd = await req.formData();
      key = pickString(fd.get("key"));
      from = pickString(fd.get("from")) || from;
      username = pickString(fd.get("username"));
      password = pickString(fd.get("password"));
    }
  } catch {
    // ignore
  }

  if (key !== expected) {
    await sleep(700);
    return NextResponse.json({ ok: false, error: "Clave incorrecta." }, { status: 401 });
  }

  if (!from.startsWith("/organizador")) from = "/organizador";
  if (!username || !password) {
    await sleep(350);
    return NextResponse.json(
      { ok: false, error: "Faltan credenciales (usuario/contraseña)." },
      { status: 400 }
    );
  }

  // ✅ busca organizador
  const r = await pool.query<{
    id: string;
    username: string;
    password_hash: string;
    is_active: boolean;
  }>(
    `
    SELECT id, username, password_hash, is_active
    FROM organizer_accounts
    WHERE LOWER(username) = LOWER($1)
    LIMIT 1
    `,
    [username]
  );

  const row = r.rows?.[0];
  if (!row || !row.is_active) {
    await sleep(700);
    return NextResponse.json({ ok: false, error: "Usuario no válido." }, { status: 401 });
  }

  const ok = verifyPassword(password, row.password_hash);
  if (!ok) {
    await sleep(700);
    return NextResponse.json({ ok: false, error: "Contraseña incorrecta." }, { status: 401 });
  }

  const res = new NextResponse(null, { status: 303, headers: { Location: from } });

  const xfProto = req.headers.get("x-forwarded-proto");
  const isHttps = xfProto === "https";

  // ✅ cookie 1: pasa el proxy/middleware (igual que antes)
  res.cookies.set({
    name: COOKIE_NAME,
    value: expected,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || isHttps,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  // ✅ cookie 2: identifica al organizador (firmada)
  const signedOrg = signOrganizerIdCookieValue(String(row.id));
  res.cookies.set({
    name: ORG_USER_COOKIE,
    value: signedOrg,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || isHttps,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}