// apps/web/src/lib/organizer-auth.pg.server.ts
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { pool } from "@/lib/db";

export type OrganizerUser = {
  id: string;
  username: string;
  displayName: string | null;
};

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

function b64(buf: Buffer) {
  return buf.toString("base64");
}
function fromB64(s: string) {
  return Buffer.from(s, "base64");
}

/**
 * Formato: scrypt$<salt_b64>$<hash_b64>
 */
export function hashPassword(plain: string) {
  const salt = randomBytes(16);
  const key = scryptSync(plain, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${b64(salt)}$${b64(Buffer.from(key))}`;
}

export function verifyPassword(plain: string, stored: string) {
  try {
    const parts = String(stored || "").split("$");
    if (parts.length !== 3) return false;
    const algo = parts[0];
    if (algo !== "scrypt") return false;

    const salt = fromB64(parts[1]);
    const expected = fromB64(parts[2]);
    const got = scryptSync(plain, salt, expected.length, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });

    return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function findOrganizerByUsername(username: string) {
  const u = username.trim().toLowerCase();
  if (!u) return null;

  const r = await pool.query<{
    id: string;
    username: string;
    display_name: string | null;
    password_hash: string;
  }>(
    `
    SELECT id, username, display_name, password_hash
    FROM organizer_users
    WHERE username = $1
    LIMIT 1
    `,
    [u]
  );

  return r.rows?.[0] ?? null;
}

export async function createOrganizerSession(organizerId: string) {
  const sid = "orgsess_" + randomBytes(24).toString("hex");

  await pool.query(
    `
    INSERT INTO organizer_sessions (id, organizer_id, created_at, expires_at)
    VALUES ($1, $2, NOW(), NOW() + interval '7 days')
    `,
    [sid, organizerId]
  );

  return sid;
}

export async function getOrganizerFromSession(sessionId: string): Promise<OrganizerUser | null> {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;

  const r = await pool.query<{
    id: string;
    username: string;
    display_name: string | null;
  }>(
    `
    SELECT ou.id, ou.username, ou.display_name
    FROM organizer_sessions os
    JOIN organizer_users ou ON ou.id = os.organizer_id
    WHERE os.id = $1
      AND os.expires_at > NOW()
    LIMIT 1
    `,
    [sid]
  );

  const row = r.rows?.[0];
  if (!row) return null;

  return { id: row.id, username: row.username, displayName: row.display_name };
}

export async function revokeOrganizerSession(sessionId: string) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  await pool.query(`DELETE FROM organizer_sessions WHERE id = $1`, [sid]);
}