// apps/web/src/app/api/organizador/login/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createOrganizerSession, findOrganizerByUsername, verifyPassword } from "@/lib/organizer-auth.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "organizer_session";

// Para que funcione en ticketchile.com y www.ticketchile.com
function cookieDomainFromHost(host: string | null) {
  const h = String(host || "").toLowerCase();
  if (h.endsWith(".ticketchile.com") || h === "ticketchile.com") return ".ticketchile.com";
  // fallback: en local no uses domain
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "").trim();

    if (!username || !password) {
      return NextResponse.json({ ok: false, error: "Faltan credenciales." }, { status: 400 });
    }

    const user = await findOrganizerByUsername(username);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Usuario/contraseña inválidos." }, { status: 401 });
    }

    const ok = verifyPassword(password, String(user.password_hash || ""));
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Usuario/contraseña inválidos." }, { status: 401 });
    }

    const sid = await createOrganizerSession(String(user.id));

    const res = NextResponse.json({ ok: true });

    const domain = cookieDomainFromHost(req.headers.get("host"));

    res.cookies.set({
      name: COOKIE_NAME,
      value: sid,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 días
      ...(domain ? { domain } : {}),
    });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno en login organizador." },
      { status: 500 }
    );
  }
}