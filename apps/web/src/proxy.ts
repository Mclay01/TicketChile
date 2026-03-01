// apps/web/src/proxy.ts
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_BACKSTAGE = "tc_org";      // compara con ORGANIZER_KEY (opcional)
const COOKIE_SESSION = "tc_org_sess";   // sesión organizador (siempre)

// ✅ Admin
const COOKIE_ADMIN_SESSION = "tc_admin_sess";

function hasOrganizerSession(req: NextRequest) {
  const sess = req.cookies.get(COOKIE_SESSION)?.value;
  return Boolean(sess && sess.trim().length > 10);
}

function hasValidBackstage(req: NextRequest) {
  const expected = String(process.env.ORGANIZER_KEY || "").trim();
  if (!expected) return true; // dev-friendly: si no hay clave global, no bloquea por backstage
  const got = req.cookies.get(COOKIE_BACKSTAGE)?.value;
  return got === expected;
}

// ✅ Admin helpers
function hasAdminSession(req: NextRequest) {
  const sess = req.cookies.get(COOKIE_ADMIN_SESSION)?.value;
  return Boolean(sess && sess.trim().length > 10);
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

// ✅ Admin path helpers
function isAdminPath(pathname: string) {
  return pathname.startsWith("/admin");
}

function isAdminLoginPath(pathname: string) {
  return pathname === "/admin/login";
}

function isAdminApiLogin(pathname: string) {
  return pathname.startsWith("/api/admin/login");
}

function isAdminApiLogout(pathname: string) {
  return pathname.startsWith("/api/admin/logout");
}

function isAdminApi(pathname: string) {
  return pathname.startsWith("/api/admin");
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

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Deja pasar login/logout organizador
  if (isOrganizerLoginPath(pathname) || isOrganizerApiLogin(pathname) || isOrganizerApiLogout(pathname)) {
    return NextResponse.next();
  }

  // Deja pasar login/logout admin
  if (isAdminLoginPath(pathname) || isAdminApiLogin(pathname) || isAdminApiLogout(pathname)) {
    return NextResponse.next();
  }

  const needsAuth =
    isOrganizerPath(pathname) ||
    isProtectedDemoApi(pathname) ||
    isAdminPath(pathname) ||
    isAdminApi(pathname);

  if (!needsAuth) return NextResponse.next();

  // --- auth organizador ---
  if (isOrganizerPath(pathname) || isProtectedDemoApi(pathname) || pathname.startsWith("/api/organizador")) {
    // auth = (backstage OK) + (sesión organizador)
    const ok = hasValidBackstage(req) && hasOrganizerSession(req);
    if (ok) return NextResponse.next();

    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "No autorizado (organizador)." }, { status: 401 });
    }

    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/organizador/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "from",
      pathname + (searchParams.toString() ? `?${searchParams}` : "")
    );

    return NextResponse.redirect(loginUrl);
  }

  // --- auth admin ---
  if (isAdminPath(pathname) || isAdminApi(pathname)) {
    const ok = hasAdminSession(req);
    if (ok) return NextResponse.next();

    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "No autorizado (admin)." }, { status: 401 });
    }

    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "from",
      pathname + (searchParams.toString() ? `?${searchParams}` : "")
    );

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
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

    // ✅ Admin
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};