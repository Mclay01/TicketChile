// apps/web/src/proxy.ts
import { NextResponse, type NextRequest } from "next/server";

const LEGACY_COOKIE = "tc_org"; // viejo (ORGANIZER_KEY)
const SESSION_COOKIE = "tc_org_session"; // nuevo (cookie firmada)

function normalizeBase64Url(s: string) {
  return String(s || "").replace(/-/g, "+").replace(/_/g, "/");
}

function base64UrlToUint8Array(b64url: string) {
  const b64 = normalizeBase64Url(b64url);
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const str = atob(b64 + pad);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64Url(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEq(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256Base64Url(secret: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return uint8ArrayToBase64Url(new Uint8Array(sig));
}

function isOrganizerPath(pathname: string) {
  return pathname.startsWith("/organizador");
}

function isOrganizerLoginPath(pathname: string) {
  return pathname === "/organizador/login";
}

function isOrganizerApiLogin(pathname: string) {
  return pathname.startsWith("/api/organizador/login");
}

function isOrganizerApiLogout(pathname: string) {
  return pathname.startsWith("/api/organizador/logout");
}

function isProtectedDemoApi(pathname: string) {
  return (
    pathname.startsWith("/api/demo/event-stats") ||
    pathname.startsWith("/api/demo/event-checkins") ||
    pathname.startsWith("/api/demo/reset-checkins") ||
    pathname.startsWith("/api/demo/export") ||
    pathname.startsWith("/api/demo/reset")
  );
}

// Formato cookie: v1.<payloadB64url>.<sigB64url>
// payload JSON: { oid: string, email: string, exp: number (ms epoch) }
async function isAuthed(req: NextRequest) {
  const secret = String(process.env.ORGANIZER_SESSION_SECRET || "").trim();

  // ✅ Nuevo modo (recomendado)
  if (secret) {
    const raw = req.cookies.get(SESSION_COOKIE)?.value || "";
    const parts = raw.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return false;

    const payloadB64 = parts[1];
    const sigB64 = parts[2];

    // Verifica firma
    const expectedSig = await hmacSha256Base64Url(secret, payloadB64);
    if (!safeEq(base64UrlToUint8Array(sigB64), base64UrlToUint8Array(expectedSig))) return false;

    // Verifica exp
    try {
      const payloadJson = new TextDecoder().decode(base64UrlToUint8Array(payloadB64));
      const payload = JSON.parse(payloadJson);
      const exp = Number(payload?.exp || 0);
      if (!exp || Number.isNaN(exp) || Date.now() > exp) return false;
      if (!payload?.oid) return false;
      return true;
    } catch {
      return false;
    }
  }

  // 🧯 Fallback legacy (mientras migras)
  const expected = process.env.ORGANIZER_KEY;
  if (!expected) return true; // dev-friendly legacy
  const got = req.cookies.get(LEGACY_COOKIE)?.value;
  return got === expected;
}

export async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Deja pasar login/logout y assets internos
  if (
    isOrganizerLoginPath(pathname) ||
    isOrganizerApiLogin(pathname) ||
    isOrganizerApiLogout(pathname)
  ) {
    return NextResponse.next();
  }

  const needsAuth = isOrganizerPath(pathname) || isProtectedDemoApi(pathname);

  if (!needsAuth) return NextResponse.next();

  if (await isAuthed(req)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "No autorizado (organizador)." }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/organizador/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("from", pathname + (searchParams.toString() ? `?${searchParams}` : ""));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/organizador/:path*",
    "/api/organizador/:path*",
    "/api/demo/event-stats",
    "/api/demo/event-checkins",
    "/api/demo/reset-checkins",
    "/api/demo/export",
    "/api/demo/reset",
  ],
};