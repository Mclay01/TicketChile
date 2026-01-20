import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { signTicketToken } from "@/lib/qr-token.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Soportamos 2 formas:
  // A) /api/qr?t=<token>
  // B) /api/qr?ticketId=...&eventId=...
  const t = pickString(url.searchParams.get("t"));

  let token = t;

  if (!token) {
    const ticketId =
      pickString(url.searchParams.get("ticketId")) ||
      pickString(url.searchParams.get("ticket_id"));
    const eventId =
      pickString(url.searchParams.get("eventId")) ||
      pickString(url.searchParams.get("event_id"));

    if (!ticketId || !eventId) {
      return NextResponse.json(
        { ok: false, error: "Falta t o ticketId/eventId." },
        { status: 400 }
      );
    }

    // Genera token firmado (requiere TICKETCHILE_QR_SECRET)
    token = signTicketToken({ ticketId, eventId });
  }

  try {
    const png = await QRCode.toBuffer(token, {
      type: "png",
      width: 260,
      margin: 1,
      errorCorrectionLevel: "M",
    });

    return new NextResponse(png, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "No se pudo generar QR." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
