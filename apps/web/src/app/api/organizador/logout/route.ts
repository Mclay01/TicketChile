// apps/web/src/app/api/organizador/logout/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { revokeOrganizerSession } from "@/lib/organizer-auth.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "organizer_session";

function cookieDomainFromHost(host: string | null) {
  const h = String(host || "").toLowerCase();
  if (h.endsWith(".ticketchile.com") || h === "ticketchile.com") return ".ticketchile.com";
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const sid = req.cookies.get(COOKIE_NAME)?.value || "";
    if (sid) await revokeOrganizerSession(sid);

    const res = NextResponse.json({ ok: true });

    const domain = cookieDomainFromHost(req.headers.get("host"));

    // Importante: borrar con el MISMO domain + path con que se creó
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
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno en logout organizador." },
      { status: 500 }
    );
  }
}