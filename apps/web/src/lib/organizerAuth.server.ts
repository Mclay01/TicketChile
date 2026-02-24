import crypto from "crypto";

function b64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlToBuf(s: string) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function mustSecret() {
  const s = String(process.env.ORGANIZER_SESSION_SECRET || "").trim();
  if (!s) {
    throw new Error("Falta ORGANIZER_SESSION_SECRET (para firmar tc_org_user).");
  }
  return s;
}

/**
 * password_hash format: scrypt$<salt_b64url>$<hash_b64url>
 */
export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64) as Buffer;
  return `scrypt$${b64url(salt)}$${b64url(hash)}`;
}

export function verifyPassword(password: string, stored: string) {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 3) return false;
    const [algo, saltB64, hashB64] = parts;
    if (algo !== "scrypt") return false;

    const salt = b64urlToBuf(saltB64);
    const expected = b64urlToBuf(hashB64);
    const got = crypto.scryptSync(password, salt, 64) as Buffer;

    return crypto.timingSafeEqual(expected, got);
  } catch {
    return false;
  }
}

/**
 * Cookie tc_org_user: <orgId>.<sig>
 * sig = HMAC_SHA256(orgId, secret) base64url
 */
export function signOrganizerIdCookieValue(organizerId: string) {
  const secret = mustSecret();
  const msg = String(organizerId || "").trim();
  const sig = crypto.createHmac("sha256", secret).update(msg).digest();
  return `${msg}.${b64url(sig)}`;
}

export function verifyOrganizerIdCookieValue(raw: string | undefined | null): string | null {
  try {
    const secret = mustSecret();
    const v = String(raw || "");
    const [id, sig] = v.split(".");
    if (!id || !sig) return null;

    const expected = crypto.createHmac("sha256", secret).update(id).digest();
    const got = b64urlToBuf(sig);

    if (got.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(expected, got)) return null;

    return id;
  } catch {
    return null;
  }
}