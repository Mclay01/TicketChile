import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { appBaseUrl } from "@/lib/stripe.server";
import { signTicketToken } from "@/lib/qr-token.server";
import { ownedTicketFromRequest } from "@/lib/ticket-access.server";
import { accessResponse, privateJson } from "@/lib/access.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ticket = await ownedTicketFromRequest(request);
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID?.trim();
    const email = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL?.trim();
    const key = (process.env.GOOGLE_WALLET_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
    if (!issuerId || !email || !key) return privateJson(503, { ok: false, error: "Google Wallet no está disponible." });
    const base = appBaseUrl();
    const suffix = (id: string) => id.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64);
    const classId = `${issuerId}.${suffix(ticket.event_id)}`;
    const claims = {
      iss: email, aud: "google", origins: [new URL(base).host], typ: "savetowallet",
      payload: {
        eventTicketClasses: [{ id: classId, issuerName: "Ticket Chile", reviewStatus: "UNDER_REVIEW",
          eventName: { defaultValue: { language: "es-CL", value: ticket.event_title } } }],
        eventTicketObjects: [{ id: `${issuerId}.${suffix(ticket.id)}`, classId, state: "ACTIVE",
          ticketNumber: ticket.id,
          barcode: { type: "QR_CODE", value: signTicketToken({ ticketId: ticket.id, eventId: ticket.event_id }) },
          textModulesData: [{ id: "INFO", header: "Ticket", body: `${ticket.ticket_type_name} · ${ticket.venue} · ${ticket.city}` }],
          linksModuleData: { uris: [{ id: "MANAGE", uri: `${base}/mis-tickets`, description: "Ver mis tickets" }] },
        }],
      },
    };
    const saveUrl = `https://pay.google.com/gp/v/save/${jwt.sign(claims, key, { algorithm: "RS256" })}`;
    if (new URL(request.url).searchParams.get("format") === "json") return privateJson(200, { ok: true, saveUrl });
    const response = NextResponse.redirect(saveUrl, 302);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) { return accessResponse(error); }
}
