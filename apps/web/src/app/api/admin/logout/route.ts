// apps/web/src/app/api/admin/logout/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { revokeAdminSession } from "@/lib/admin-auth.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "tc_admin_sess";

function cookieDomainFromHost(host: string | null) {
  const h = String(host || "").toLowerCase();
  if (h.endsWith(".ticketchile.com") || h === "ticketchile.com") return ".ticketchile.com";
  return undefined;
}

function isProbablyBrowserForm(req: NextRequest) {
  const accept = String(req.headers.get("accept") || "").toLowerCase();
  const ct = String(req.headers.get("content-type") || "").toLowerCase();

  const isForm =
    ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");

  const wantsHtml = accept.includes("text/html");
  return isForm || wantsHtml;
}

export async function POST(req: NextRequest) {
  const sid = req.cookies.get(COOKIE_NAME)?.value || "";
  if (sid) await revokeAdminSession(sid);

  const domain = cookieDomainFromHost(req.headers.get("host"));

  // Browser/form => redirect
  if (isProbablyBrowserForm(req)) {
    const res = NextResponse.redirect(new URL("/admin/login", req.url), { status: 303 });

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

  // JSON/AJAX => JSON ok
  const res = NextResponse.json({ ok: true });
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