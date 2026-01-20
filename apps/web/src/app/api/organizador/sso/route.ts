import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "tc_org";

function safeFrom(v: string | null) {
  if (!v) return "/organizador";
  return v.startsWith("/organizador") ? v : "/organizador";
}

function baseOriginFromEnv(fallbackOrigin: string) {
  const env = (process.env.NEXTAUTH_URL || "").trim();
  if (env) return env.replace(/\/+$/, ""); // sin trailing slash

  // fallback defensivo (si alguien navega con 0.0.0.0, lo reemplazamos)
  if (fallbackOrigin.includes("://0.0.0.0")) {
    return fallbackOrigin.replace("://0.0.0.0", "://localhost");
  }
  return fallbackOrigin;
}

function isAllowedOrganizerEmail(email?: string | null) {
  if (!email) return false;

  // Optional allowlist: ORGANIZER_EMAILS="a@b.com,c@d.com"
  const raw = process.env.ORGANIZER_EMAILS || "";
  if (!raw.trim()) return true; // si no configuras allowlist, cualquier logueado puede usar SSO

  const allow = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return allow.includes(String(email).toLowerCase());
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = safeFrom(url.searchParams.get("from"));

  // ✅ SIEMPRE usa una base navegable (localhost / dominio real)
  const base = baseOriginFromEnv(url.origin);

  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;

  // No hay sesión -> manda a /signin
  if (!email) {
    const signInUrl = new URL("/signin", base);
    signInUrl.searchParams.set("callbackUrl", from);
    return NextResponse.redirect(signInUrl);
  }

  // Sesión sí, pero no autorizado -> manda a login organizador
  if (!isAllowedOrganizerEmail(email)) {
    const loginUrl = new URL("/organizador/login", base);
    loginUrl.searchParams.set("from", from);
    return NextResponse.redirect(loginUrl);
  }

  // Setea cookie para pasar middleware
  const expected = process.env.ORGANIZER_KEY || "";
  const res = NextResponse.redirect(new URL(from, base));

  if (expected) {
    res.cookies.set({
      name: COOKIE_NAME,
      value: expected,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 días
    });
  }

  return res;
}
