// apps/web/src/app/api/organizador/login/route.ts
import { NextResponse } from "next/server";
import { createOrganizerSession, findOrganizerByUsername, verifyPassword } from "@/lib/organizer-auth.pg.server";

const COOKIE_BACKSTAGE = "tc_org";
const COOKIE_SESSION = "tc_org_sess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  const expectedKey = String(process.env.ORGANIZER_KEY || "").trim();
  if (!expectedKey) {
    return NextResponse.json({ ok: false, error: "ORGANIZER_KEY no está configurado" }, { status: 500 });
  }

  const ct = req.headers.get("content-type") || "";
  let key = "";
  let from = "/organizador";
  let username = "";
  let password = "";

  try {
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      key = String(body?.key || "");
      from = String(body?.from || from);
      username = String(body?.username || "");
      password = String(body?.password || "");
    } else {
      const fd = await req.formData();
      key = String(fd.get("key") || "");
      from = String(fd.get("from") || from);
      username = String(fd.get("username") || "");
      password = String(fd.get("password") || "");
    }
  } catch {
    // ignore
  }

  key = key.trim();
  if (key !== expectedKey) {
    await sleep(450);
    const res = new NextResponse(null, {
      status: 303,
      headers: { Location: "/organizador/login?reason=bad_key" },
    });
    return res;
  }

  if (!from.startsWith("/organizador")) from = "/organizador";

  const u = username.trim().toLowerCase();
  const p = password;

  const row = await findOrganizerByUsername(u);
  if (!row || !verifyPassword(p, row.password_hash)) {
    await sleep(450);
    const res = new NextResponse(null, {
      status: 303,
      headers: { Location: "/organizador/login?reason=bad_login" },
    });
    return res;
  }

  const sid = await createOrganizerSession(row.id);

  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: from },
  });

  const xfProto = req.headers.get("x-forwarded-proto");
  const isHttps = xfProto === "https";

  // cookie backstage (pasa proxy)
  res.cookies.set({
    name: COOKIE_BACKSTAGE,
    value: expectedKey,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || isHttps,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  // cookie sesión organizador (identidad real)
  res.cookies.set({
    name: COOKIE_SESSION,
    value: sid,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || isHttps,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}