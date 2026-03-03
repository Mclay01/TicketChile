import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { pool } from "@/lib/db";
import { createOrganizerSession } from "@/lib/organizer-auth.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_SESS = "tc_org_sess";

function safeFrom(v: string | null) {
  if (!v) return "/organizador";
  return v.startsWith("/organizador") ? v : "/organizador";
}

function cookieDomainFromHost(host: string | null) {
  const h = String(host || "").toLowerCase();
  if (h.endsWith(".ticketchile.com") || h === "ticketchile.com") return ".ticketchile.com";
  return undefined;
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

  const session = await getServerSession(authOptions);
  const email = (session?.user?.email ?? "").toLowerCase();

  // No hay sesión NextAuth
  if (!email) {
    const signInUrl = new URL("/signin", url.origin);
    signInUrl.searchParams.set("callbackUrl", "/mis-tickets");
    return NextResponse.redirect(signInUrl);
  }

  // No allowlisted => login normal organizador
  if (!isAllowedOrganizerEmail(email)) {
    const loginUrl = new URL("/organizador/login", url.origin);
    loginUrl.searchParams.set("from", from);
    return NextResponse.redirect(loginUrl);
  }

  // ✅ Busca organizer por email
  const r = await pool.query<{
    id: string;
    verified: boolean;
    approved: boolean;
  }>(
    `
    SELECT id, verified, approved
    FROM organizer_users
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1
    `,
    [email]
  );

  const row = r.rows?.[0];
  if (!row) {
    const loginUrl = new URL("/organizador/login", url.origin);
    loginUrl.searchParams.set("reason", "no_account");
    loginUrl.searchParams.set("from", from);
    return NextResponse.redirect(loginUrl);
  }

  if (!row.verified) {
    const loginUrl = new URL("/organizador/login", url.origin);
    loginUrl.searchParams.set("reason", "unverified");
    loginUrl.searchParams.set("from", from);
    return NextResponse.redirect(loginUrl);
  }

  if (!row.approved) {
    const loginUrl = new URL("/organizador/login", url.origin);
    loginUrl.searchParams.set("reason", "pending");
    loginUrl.searchParams.set("from", from);
    return NextResponse.redirect(loginUrl);
  }

  // ✅ Crea sesión real
  const sid = await createOrganizerSession(row.id);
  const domain = cookieDomainFromHost(req.headers.get("host"));

  const res = NextResponse.redirect(new URL(from, url.origin));
  res.cookies.set({
    name: COOKIE_SESS,
    value: sid,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    ...(domain ? { domain } : {}),
  });

  return res;
}