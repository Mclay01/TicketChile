// apps/web/src/app/api/demo/qr/route.ts
import { NextResponse } from "next/server";
import * as QRCode from "qrcode";
import { signTicketToken } from "@/lib/qr-token.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticketId = pickString(url.searchParams.get("ticketId"));
  const eventId = pickString(url.searchParams.get("eventId"));

  if (!ticketId || !eventId) {
    return NextResponse.json({ ok: false, error: "Falta ticketId o eventId." }, { status: 400 });
  }

  // QR contiene SOLO el token (no URL). Más compatible con scanners.
  const token = signTicketToken({ ticketId, eventId });

  try {
    // Si TS se pone quisquilloso con typings, lo tipamos de forma segura.
    const toBuffer = (QRCode as any).toBuffer as (
      text: string,
      opts?: any
    ) => Promise<Buffer>;

    const png = await toBuffer(token, {
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
