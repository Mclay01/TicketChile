import { NextResponse } from "next/server";

const COOKIE_NAME = "tc_org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.ORGANIZER_KEY;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "ORGANIZER_KEY no está configurado en .env.local" },
      { status: 500 }
    );
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
    return NextResponse.json({ ok: false, error: "Clave incorrecta." }, { status: 401 });
  }

  if (!from.startsWith("/organizador")) from = "/organizador";

  // ✅ Redirect relativo (no más 0.0.0.0)
  const res = new NextResponse(null, {
    status: 303, // PRG: Post/Redirect/Get
    headers: { Location: from },
  });

  // Secure: en prod o cuando vienes por https (cloudflared)
  const xfProto = req.headers.get("x-forwarded-proto");
  const isHttps = xfProto === "https";

  res.cookies.set({
    name: COOKIE_NAME,
    value: expected,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || isHttps,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 días
  });

  return res;
}
