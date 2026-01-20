import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import jwt from "jsonwebtoken";
import { appBaseUrl } from "@/lib/stripe.server";
import { verifyTicketToken } from "@/lib/qr-token.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonRes(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function pk() {
  const k = process.env.GOOGLE_WALLET_PRIVATE_KEY || "";
  return k.replace(/\\n/g, "\n").trim();
}

function safeSuffix(input: string) {
  // Wallet IDs: mejor no inventar caracteres raros
  const s = String(input || "").trim();
  const cleaned = s.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.slice(0, 64);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const tokenParam = String(searchParams.get("t") ?? "").trim();
    const asJson = (searchParams.get("format") ?? "").toLowerCase() === "json";

    let ticketId = "";
    let eventId = "";

    if (tokenParam) {
      const verified = verifyTicketToken(tokenParam);
      if (!verified) return jsonRes(400, { ok: false, error: "Token inválido." });
      ticketId = verified.ticketId;
      eventId = verified.eventId;
    } else {
      // fallback dev (no recomendado en prod)
      ticketId = String(searchParams.get("ticket_id") ?? "").trim();
      if (!ticketId) return jsonRes(400, { ok: false, error: "Falta t (token) o ticket_id." });
    }

    const issuerId = (process.env.GOOGLE_WALLET_ISSUER_ID || "").trim();
    const saEmail = (process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL || "").trim();
    const privateKey = pk();

    if (!issuerId || !saEmail || !privateKey) {
      return jsonRes(501, {
        ok: false,
        error:
          "Google Wallet no configurado. Falta GOOGLE_WALLET_ISSUER_ID / GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL / GOOGLE_WALLET_PRIVATE_KEY.",
      });
    }

    // Ticket + order + event
    const r = await pool.query(
      `
      SELECT
        t.id, t.ticket_type_name, t.event_id,
        o.id AS order_id, o.event_title, o.buyer_name, o.buyer_email,
        e.slug, e.city, e.venue, e.date_iso
      FROM tickets t
      JOIN orders o ON o.id = t.order_id
      JOIN events e ON e.id = t.event_id
      WHERE t.id = $1
      LIMIT 1
      `,
      [ticketId]
    );

    if (r.rowCount === 0) return jsonRes(404, { ok: false, error: "Ticket no encontrado." });

    const t = r.rows[0];

    // Si venía token, validamos coherencia
    if (eventId && String(t.event_id) !== String(eventId)) {
      return jsonRes(400, { ok: false, error: "Token no coincide con el evento del ticket." });
    }

    const base = appBaseUrl();
    const host = new URL(base).host; // ejemplo oficial usa "www.example.com" (host, sin scheme) :contentReference[oaicite:1]{index=1}

    const classSuffix = safeSuffix(String(t.event_id));
    const objectSuffix = safeSuffix(String(t.id));
    const classId = `${issuerId}.${classSuffix}`;
    const objectId = `${issuerId}.${objectSuffix}`;

    // Barcode: usa el MISMO token firmado (anti “photoshop”)
    const barcodeValue = tokenParam || `TICKET:${t.id}`;

    const newClass = {
      id: classId,
      issuerName: "Ticket Chile",
      reviewStatus: "UNDER_REVIEW",
      eventName: {
        defaultValue: { language: "es-CL", value: String(t.event_title || "Evento") },
      },
    };

    const newObject = {
      id: objectId,
      classId,
      state: "ACTIVE",
      ticketHolderName: String(t.buyer_name || t.buyer_email || ""),
      ticketNumber: String(t.id),
      barcode: {
        type: "QR_CODE",
        value: barcodeValue,
      },
      textModulesData: [
        {
          id: "INFO",
          header: "Ticket",
          body: `${String(t.ticket_type_name || "")}\n${String(t.venue || "")} — ${String(t.city || "")}`,
        },
      ],
      linksModuleData: {
        uris: [
          {
            id: "MANAGE",
            uri: `${base}/mis-tickets?email=${encodeURIComponent(String(t.buyer_email || ""))}`,
            description: "Ver mis tickets",
          },
        ],
      },
    };

    // Estructura JWT según ejemplo oficial: iss/aud/origins/typ/payload :contentReference[oaicite:2]{index=2}
    const claims = {
      iss: saEmail,
      aud: "google",
      origins: [host],
      typ: "savetowallet",
      payload: {
        eventTicketClasses: [newClass],
        eventTicketObjects: [newObject],
      },
    };

    const signed = jwt.sign(claims, privateKey, { algorithm: "RS256" });
    const saveUrl = `https://pay.google.com/gp/v/save/${signed}`;

    if (asJson) return jsonRes(200, { ok: true, saveUrl });
    return NextResponse.redirect(saveUrl, 302);
  } catch (e: any) {
    return jsonRes(500, { ok: false, error: String(e?.message || e) });
  }
}
