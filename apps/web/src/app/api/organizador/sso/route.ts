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
  if (env) return env.replace(/\/+$/, "");

  if (fallbackOrigin.includes("://0.0.0.0")) {
    return fallbackOrigin.replace("://0.0.0.0", "://localhost");
  }
  return fallbackOrigin;
}

function parseAllowlist(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedOrganizerEmail(email?: string | null) {
  if (!email) return false;

  // ✅ FAIL-CLOSED: si no configuras allowlist, NADIE pasa por SSO
  const raw = String(process.env.ORGANIZER_EMAILS || "").trim();
  if (!raw) return false;

  const allow = parseAllowlist(raw);
  return allow.includes(String(email).toLowerCase());
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = safeFrom(url.searchParams.get("from"));
  const base = baseOriginFromEnv(url.origin);

  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;

  // No hay sesión -> al login público (pero NO le damos callback a /organizador)
  if (!email) {
    const signInUrl = new URL("/signin", base);
    // lo mandamos a mis-tickets, no al panel interno
    signInUrl.searchParams.set("callbackUrl", "/mis-tickets");
    return NextResponse.redirect(signInUrl);
  }

  // Hay sesión pero no está en allowlist -> manda al login interno del organizador
  // (ahí tú te autenticas con tu método interno)
  if (!isAllowedOrganizerEmail(email)) {
    const loginUrl = new URL("/organizador/login", base);
    loginUrl.searchParams.set("from", from);
    return NextResponse.redirect(loginUrl);
  }

  // ✅ Solo allowlist pasa
  const expected = String(process.env.ORGANIZER_KEY || "").trim();
  const res = NextResponse.redirect(new URL(from, base));

  if (expected) {
    res.cookies.set({
      name: COOKIE_NAME,
      value: expected,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return res;
}