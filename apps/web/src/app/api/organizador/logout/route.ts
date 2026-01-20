import { NextResponse } from "next/server";

const COOKIE_NAME = "tc_org";

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

  // Redirige SIEMPRE al host real que estás usando (localhost / 192.168 / trycloudflare)
  const redirectUrl = new URL("/organizador/login?from=%2Forganizador", base);

  const res = NextResponse.redirect(redirectUrl, { status: 303 });

  // Si estabas en https (cloudflared), borra cookie con secure=true también
  const isHttps = redirectUrl.protocol === "https:";

  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || isHttps,
    path: "/",
    maxAge: 0,
  });

  return res;
}
