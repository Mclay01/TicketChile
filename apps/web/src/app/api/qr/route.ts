import { NextResponse } from "next/server";
import { ownedTicketFromRequest } from "@/lib/ticket-access.server";
import { renderTicketQr } from "@/lib/qr-render.server";
import { accessResponse } from "@/lib/access.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const ticket = await ownedTicketFromRequest(request);
    const png = await renderTicketQr(ticket);
    return new NextResponse(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch (error) { return accessResponse(error); }
}
