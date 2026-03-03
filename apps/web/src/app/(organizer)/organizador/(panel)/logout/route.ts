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
  const from = url.searchParams.get("from") || "/organizador";
  const reason = url.searchParams.get("reason") || "missing";

  const ck = await cookies();
  const sid = ck.get(COOKIE_NAME)?.value || "";

  // intenta revocar en DB (si existe)
  if (sid) {
    try {
      await revokeOrganizerSession(sid);
    } catch {}
  }

  const res = NextResponse.redirect(new URL(`/organizador/login?from=${encodeURIComponent(from)}&reason=${encodeURIComponent(reason)}`, url.origin), {
    status: 303,
  });

  const domain = cookieDomainFromHost(url.host);

  // borra cookie con mismos flags
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

  return res;
}