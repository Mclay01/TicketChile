import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

const COOKIE_NAME = "tc_org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseAllowlist(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedOrganizerEmail(email?: string | null) {
  if (!email) return false;

  // ✅ FAIL-CLOSED: si no configuras allowlist, NADIE entra
  const raw = String(process.env.ORGANIZER_EMAILS || "").trim();
  if (!raw) return false;

  const allow = parseAllowlist(raw);
  return allow.includes(String(email).toLowerCase());
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  const expected = String(process.env.ORGANIZER_KEY || "").trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "ORGANIZER_KEY no está configurado" },
      { status: 500 }
    );
  }

  // ✅ Requiere sesión NextAuth + allowlist (tu cuenta)
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;

  if (!isAllowedOrganizerEmail(email)) {
    // 303 a /organizador/login (o /signin si quieres)
    const res = new NextResponse(null, {
      status: 303,
      headers: { Location: "/organizador/login?reason=not_allowed" },
    });
    return res;
  }

  const ct = req.headers.get("content-type") || "";
  let key = "";
  let from = "/organizador";

  try {
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      key = String(body?.key || "");
      from = String(body?.from || from);
    } else {
      const fd = await req.formData();
      key = String(fd.get("key") || "");
      from = String(fd.get("from") || from);
    }
  } catch {
    // ignore
  }

  key = key.trim();
  if (key !== expected) {
    // mini “anti-bruteforce” barato (sin infra extra)
    await sleep(700);
    return NextResponse.json({ ok: false, error: "Clave incorrecta." }, { status: 401 });
  }

  if (!from.startsWith("/organizador")) from = "/organizador";

  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: from },
  });

  const xfProto = req.headers.get("x-forwarded-proto");
  const isHttps = xfProto === "https";

  res.cookies.set({
    name: COOKIE_NAME,
    value: expected,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || isHttps,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}