import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminFromSession } from "@/lib/admin-auth.pg.server";

export async function getCurrentAdmin() {
  const jar = await cookies();
  const sessionId = jar.get("tc_admin_sess")?.value ?? "";
  return getAdminFromSession(sessionId);
}

/** Each admin handler must call this before reading data or performing work. */
export async function requireAdmin(request: Request) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { ok: false, error: "No autorizado." },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        ),
      };
    }

    // Cookie-authenticated browser mutations must originate from this origin.
    const origin = request.headers.get("origin");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) &&
        ((origin && origin !== new URL(request.url).origin) ||
         request.headers.get("sec-fetch-site") === "cross-site")) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { ok: false, error: "Solicitud no permitida." },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        ),
      };
    }
    return { ok: true as const, admin };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "No se pudo validar la sesión. Intenta nuevamente." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
}
