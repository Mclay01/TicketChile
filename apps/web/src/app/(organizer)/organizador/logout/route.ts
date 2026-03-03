import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeOrganizerSession } from "@/lib/organizer-auth.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "tc_org_sess";

function cookieDomainFromHost(host: string | null) {
  const h = String(host || "").toLowerCase();
  if (h.endsWith(".ticketchile.com") || h === "ticketchile.com") return ".ticketchile.com";
  return undefined;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const ck = await cookies();
  const sid = ck.get(COOKIE_NAME)?.value || "";

  if (sid) {
    try {
      await revokeOrganizerSession(sid);
    } catch {}
  }

  const res = NextResponse.redirect(
    new URL("/organizador/login?reason=logged_out", url.origin),
    { status: 303 }
  );

  const domain = cookieDomainFromHost(url.host);

  // borrar cookie principal
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    ...(domain ? { domain } : {}),
  });

  // borrar cookies legacy por si quedaron (evita reason=invalid)
  res.cookies.set({
    name: "organizer_session",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    ...(domain ? { domain } : {}),
  });

  return res;
}