// apps/web/src/app/api/admin/login/route.ts
import { NextResponse, type NextRequest } from "next/server";
import {
  createAdminSession,
  findAdminByUsername,
  verifyPassword,
} from "@/lib/admin-auth.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "tc_admin_sess";
const DEFAULT_NEXT = "/admin";

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

async function readBody(req: NextRequest): Promise<Record<string, any>> {
  const ct = String(req.headers.get("content-type") || "").toLowerCase();

  if (ct.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as any;
  }

  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return {};
    const obj: Record<string, any> = {};
    for (const [k, v] of fd.entries()) obj[k] = v;
    return obj;
  }

  return (await req.json().catch(() => ({}))) as any;
}

function pickString(obj: Record<string, any>, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function safeNextPath(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return DEFAULT_NEXT;
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("//")) return DEFAULT_NEXT;
  if (!s.startsWith("/")) return DEFAULT_NEXT;
  return s;
}

export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);

    const usernameRaw = pickString(body, ["username", "user", "email", "usuario"]);
    const passwordRaw = pickString(body, ["password", "pass", "clave", "contrasena", "contraseña"]);
    const nextRaw = pickString(body, ["next", "redirect", "redirectTo", "from"]);

    const username = usernameRaw.toLowerCase();
    const password = passwordRaw;

    if (!username || !password) {
      if (isProbablyBrowserForm(req)) {
        const url = new URL("/admin/login?reason=missing", req.url);
        return NextResponse.redirect(url, { status: 303 });
      }
      return NextResponse.json({ ok: false, error: "Faltan credenciales." }, { status: 400 });
    }

    const row = await findAdminByUsername(username);
    if (!row) {
      if (isProbablyBrowserForm(req)) {
        const url = new URL("/admin/login?reason=invalid", req.url);
        return NextResponse.redirect(url, { status: 303 });
      }
      return NextResponse.json({ ok: false, error: "Credenciales inválidas." }, { status: 401 });
    }

    const ok = verifyPassword(password, row.password_hash);
    if (!ok) {
      if (isProbablyBrowserForm(req)) {
        const url = new URL("/admin/login?reason=invalid", req.url);
        return NextResponse.redirect(url, { status: 303 });
      }
      return NextResponse.json({ ok: false, error: "Credenciales inválidas." }, { status: 401 });
    }

    const sid = await createAdminSession(row.id);
    const domain = cookieDomainFromHost(req.headers.get("host"));
    const nextPath = safeNextPath(nextRaw) || DEFAULT_NEXT;

    // ✅ Browser/form => redirect a panel
    if (isProbablyBrowserForm(req)) {
      const url = new URL(nextPath, req.url);
      const res = NextResponse.redirect(url, { status: 303 });

      res.cookies.set({
        name: COOKIE_NAME,
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

    // ✅ JSON/AJAX => JSON ok
    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: COOKIE_NAME,
      value: sid,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      ...(domain ? { domain } : {}),
    });

    return res;
  } catch (e: any) {
    try {
      const url = new URL("/admin/login?reason=error", req.url);
      if (isProbablyBrowserForm(req)) return NextResponse.redirect(url, { status: 303 });
    } catch {}

    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno en login admin." },
      { status: 500 }
    );
  }
}