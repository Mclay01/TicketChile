// apps/web/src/lib/qr-token.server.ts
import crypto from "node:crypto";

const SECRET = process.env.TICKETCHILE_QR_SECRET;

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hmac(payload: string) {
  if (!SECRET) {
    throw new Error("Falta TICKETCHILE_QR_SECRET en apps/web/.env.local");
  }
  return b64url(crypto.createHmac("sha256", SECRET).update(payload).digest());
}

/**
 * Formato token:
 * tc1.<ticketId>.<eventId>.<iatMs>.<sig>
 */
export function signTicketToken(input: { ticketId: string; eventId: string; iatMs?: number }) {
  const iatMs = input.iatMs ?? Date.now();
  const payload = `tc1.${input.ticketId}.${input.eventId}.${iatMs}`;
  const sig = hmac(payload);
  return `${payload}.${sig}`;
}

export function verifyTicketToken(token: string): null | { ticketId: string; eventId: string; iatMs: number } {
  const parts = token.split(".");
  if (parts.length !== 5) return null;

  const [v, ticketId, eventId, iatStr, sig] = parts;
  if (v !== "tc1") return null;

  const iatMs = Number(iatStr);
  if (!Number.isFinite(iatMs) || iatMs <= 0) return null;

  const payload = `tc1.${ticketId}.${eventId}.${iatMs}`;
  const expected = hmac(payload);

  // Comparación segura (evita timing attacks)
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  return { ticketId, eventId, iatMs };
}
