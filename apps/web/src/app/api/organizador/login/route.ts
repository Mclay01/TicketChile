// apps/web/src/app/api/organizador/login/route.ts
import { NextResponse, type NextRequest } from "next/server";
import {
  createOrganizerSession,
  findOrganizerByUsername,
  verifyPassword,
} from "@/lib/organizer-auth.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "organizer_session";

// por defecto, a dónde caer después de login
const DEFAULT_NEXT = "/organizador";

function cookieDomainFromHost(host: string | null) {
  const h = String(host || "").toLowerCase();
  if (h.endsWith(".ticketchile.com") || h === "ticketchile.com") return ".ticketchile.com";
  return undefined; // local / otros dominios
}

function isProbablyBrowserForm(req: NextRequest) {
  // Si viene desde <form> normal, normalmente Accept incluye text/html.
  const accept = String(req.headers.get("accept") || "").toLowerCase();
  const ct = String(req.headers.get("content-type") || "").toLowerCase();

  const isForm =
    ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");

  const wantsHtml = accept.includes("text/html");
  return isForm || wantsHtml;
}

async function readBody(req: NextRequest): Promise<Record<string, any>> {
  const ct = String(req.headers.get("content-type") || "").toLowerCase();

  // JSON
  if (ct.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as any;
  }

  // Form / urlencoded / multipart
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return {};
    const obj: Record<string, any> = {};
    for (const [k, v] of fd.entries()) obj[k] = v;
    return obj;
  }

  // Fallback: intenta JSON igual
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
  // Evita open redirects (nada de http://... ni //evil.com)
  const s = String(raw || "").trim();
  if (!s) return DEFAULT_NEXT;
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("//")) return DEFAULT_NEXT;
  if (!s.startsWith("/")) return DEFAULT_NEXT;
  return s;
}

export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);

    // Acepta múltiples nombres para no depender de la UI
    const usernameRaw = pickString(body, ["username", "user", "email", "usuario"]);
    const passwordRaw = pickString(body, ["password", "pass", "clave", "contrasena", "contraseña"]);
    const nextRaw = pickString(body, ["next", "redirect", "redirectTo"]);

    const username = usernameRaw.toLowerCase();
    const password = passwordRaw;

    if (!username || !password) {
      // Si es form/browser => lo mandamos al login con reason
      if (isProbablyBrowserForm(req)) {
        const url = new URL("/organizador/login?reason=missing", req.url);
        return NextResponse.redirect(url, { status: 303 });
      }

      return NextResponse.json(
        { ok: false, error: "Faltan credenciales.", debug: { receivedKeys: Object.keys(body || {}) } },
        { status: 400 }
      );
    }

    const user = await findOrganizerByUsername(username);
    if (!user) {
      if (isProbablyBrowserForm(req)) {
        const url = new URL("/organizador/login?reason=invalid", req.url);
        return NextResponse.redirect(url, { status: 303 });
      }
      return NextResponse.json({ ok: false, error: "Usuario/contraseña inválidos." }, { status: 401 });
    }

    const ok = verifyPassword(password, String(user.password_hash || ""));
    if (!ok) {
      if (isProbablyBrowserForm(req)) {
        const url = new URL("/organizador/login?reason=invalid", req.url);
        return NextResponse.redirect(url, { status: 303 });
      }
      return NextResponse.json({ ok: false, error: "Usuario/contraseña inválidos." }, { status: 401 });
    }

    const sid = await createOrganizerSession(String(user.id));
    const domain = cookieDomainFromHost(req.headers.get("host"));
    const nextPath = safeNextPath(nextRaw) || DEFAULT_NEXT;

    // ✅ Si es browser/form => redirect al panel
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

    // ✅ Si es JSON/AJAX => responde JSON
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
    // si viene de browser, mejor redirigir con reason
    try {
      const url = new URL("/organizador/login?reason=error", req.url);
      if (isProbablyBrowserForm(req)) return NextResponse.redirect(url, { status: 303 });
    } catch {}

    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno en login organizador." },
      { status: 500 }
    );
  }
}