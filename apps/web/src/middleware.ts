// proxy.ts
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "tc_org";

function isAuthed(req: NextRequest) {
  const expected = process.env.ORGANIZER_KEY;
  if (!expected) return true; // si no hay clave configurada, no bloqueamos (dev-friendly)
  const got = req.cookies.get(COOKIE_NAME)?.value;
  return got === expected;
}

function isOrganizerPath(pathname: string) {
  return pathname.startsWith("/organizador");
}

function isOrganizerLoginPath(pathname: string) {
  return pathname === "/organizador/login";
}

function isOrganizerSsoPath(pathname: string) {
  return pathname.startsWith("/api/organizador/sso");
}

function isProtectedDemoApi(pathname: string) {
  // Solo protegemos lo “admin” (scanner/exports/resets). Lo público queda abierto.
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

  // Deja pasar login + SSO
  if (
    isOrganizerLoginPath(pathname) ||
    pathname.startsWith("/api/organizador/login") ||
    isOrganizerSsoPath(pathname)
  ) {
    return NextResponse.next();
  }

  const needsAuth =
    isOrganizerPath(pathname) ||
    isProtectedDemoApi(pathname) ||
    pathname.startsWith("/api/organizador/logout");

  if (!needsAuth) return NextResponse.next();

  if (isAuthed(req)) return NextResponse.next();

  // Si es API -> 401 JSON
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "No autorizado (organizador)." }, { status: 401 });
  }

  // Si es página -> redirect a login, guardando “from”
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
