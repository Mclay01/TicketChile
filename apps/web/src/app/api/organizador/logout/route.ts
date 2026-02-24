// apps/web/src/app/api/organizador/logout/route.ts
import { NextResponse } from "next/server";
import { revokeOrganizerSession } from "@/lib/organizer-auth.pg.server";

const COOKIE_BACKSTAGE = "tc_org";
const COOKIE_SESSION = "tc_org_sess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBaseUrl(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    "localhost:3001";
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  const base = getBaseUrl(req);

  const redirectUrl = new URL("/organizador/login?from=%2Forganizador", base);
  const res = NextResponse.redirect(redirectUrl, { status: 303 });

  const isHttps = redirectUrl.protocol === "https:";

  // revoca sesión si existe
  try {
    const cookie = req.headers.get("cookie") || "";
    const m = cookie.match(/(?:^|;\s*)tc_org_sess=([^;]+)/);
    const sid = m?.[1] ? decodeURIComponent(m[1]) : "";
    if (sid) await revokeOrganizerSession(sid);
  } catch {
    // ignore
  }

  // borra cookies
  res.cookies.set({
    name: COOKIE_BACKSTAGE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || isHttps,
    path: "/",
    maxAge: 0,
  });

  res.cookies.set({
    name: COOKIE_SESSION,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || isHttps,
    path: "/",
    maxAge: 0,
  });

  return res;
}