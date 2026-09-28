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
export function signTicketToken(input: { ticketId: string; eventId: string; iatMs?: number; credentialVersion?: number }) {
  const iatMs = input.iatMs ?? Date.now();
  const version=input.credentialVersion;
  if(version!==undefined&&(!Number.isSafeInteger(version)||version<0)) throw new Error('Invalid credential generation');
  const payload = version===undefined ? `tc1.${input.ticketId}.${input.eventId}.${iatMs}` : `tc2.${input.ticketId}.${input.eventId}.${iatMs}.${version}`;
  const sig = hmac(payload);
  return `${payload}.${sig}`;
}

export function verifyTicketToken(token: string): null | { ticketId: string; eventId: string; iatMs: number; credentialVersion?: number } {
  const parts = token.split(".");
  if (parts.length !== 5 && parts.length !== 6) return null;

  const [v, ticketId, eventId, iatStr] = parts;
  if (!((v==='tc1'&&parts.length===5)||(v==='tc2'&&parts.length===6))) return null;
  const sig=parts.at(-1)!;
  const version=v==='tc2'?Number(parts[4]):0;
  if(!Number.isSafeInteger(version)||version<0||(v==='tc2'&&String(version)!==parts[4]))return null;

  const iatMs = Number(iatStr);
  if (!Number.isFinite(iatMs) || iatMs <= 0) return null;

  const payload = parts.slice(0,-1).join('.');
  const expected = hmac(payload);

  // Comparación segura (evita timing attacks)
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  return v==='tc1'?{ ticketId, eventId, iatMs }:{ ticketId, eventId, iatMs,credentialVersion:version };
}
