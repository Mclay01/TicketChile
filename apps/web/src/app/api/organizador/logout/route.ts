import { NextResponse } from "next/server";

const COOKIE_NAME = "tc_org";
const ORG_USER_COOKIE = "tc_org_user";

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

  // borra cookie proxy
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || isHttps,
    path: "/",
    maxAge: 0,
  });

  // borra cookie organizador
  res.cookies.set({
    name: ORG_USER_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || isHttps,
    path: "/",
    maxAge: 0,
  });

  return res;
}