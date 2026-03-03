// apps/web/src/proxy.ts
import { NextResponse, type NextRequest } from "next/server";

// ✅ Organizer
const COOKIE_SESSION = "tc_org_sess";

// ✅ Admin
const COOKIE_ADMIN_SESSION = "tc_admin_sess";

function hasOrganizerSession(req: NextRequest) {
  const sess = req.cookies.get(COOKIE_SESSION)?.value;
  return Boolean(sess && sess.trim().length > 10);
}

function hasAdminSession(req: NextRequest) {
  const sess = req.cookies.get(COOKIE_ADMIN_SESSION)?.value;
  return Boolean(sess && sess.trim().length > 10);
}

function isOrganizerPath(pathname: string) {
  return pathname.startsWith("/organizador");
}

function isOrganizerPublicPage(pathname: string) {
  return (
    pathname === "/organizador/login" ||
    pathname === "/organizador/registro" ||
    pathname === "/organizador/verificar"
  );
}

function isOrganizerApi(pathname: string) {
  return pathname.startsWith("/api/organizador");
}

function isOrganizerPublicApi(pathname: string) {
  return (
    pathname.startsWith("/api/organizador/login") ||
    pathname.startsWith("/api/organizador/logout") ||
    pathname.startsWith("/api/organizador/register") ||
    pathname.startsWith("/api/organizador/verify") ||
    pathname.startsWith("/api/organizador/resend")
  );
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

  // ✅ Organizer allowlist (público)
  if (isOrganizerPublicPage(pathname) || (isOrganizerApi(pathname) && isOrganizerPublicApi(pathname))) {
    return NextResponse.next();
  }

  // ✅ Admin allowlist (login/logout)
  if (isAdminLoginPath(pathname) || isAdminApiLogin(pathname) || isAdminApiLogout(pathname)) {
    return NextResponse.next();
  }

  const needsAuth =
    isOrganizerPath(pathname) ||
    isOrganizerApi(pathname) ||
    isProtectedDemoApi(pathname) ||
    isAdminPath(pathname) ||
    isAdminApi(pathname);

  if (!needsAuth) return NextResponse.next();

  // --- auth organizador ---
  if (isOrganizerPath(pathname) || isOrganizerApi(pathname) || isProtectedDemoApi(pathname)) {
    const ok = hasOrganizerSession(req);
    if (ok) return NextResponse.next();

    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "No autorizado (organizador)." }, { status: 401 });
    }

    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/organizador/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("from", pathname + (searchParams.toString() ? `?${searchParams}` : ""));
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
    loginUrl.searchParams.set("from", pathname + (searchParams.toString() ? `?${searchParams}` : ""));
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