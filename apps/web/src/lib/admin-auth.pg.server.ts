// apps/web/src/lib/admin-auth.pg.server.ts
import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { pool } from "@/lib/db";

export type AdminUser = {
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

export async function findAdminByUsername(username: string) {
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
    FROM admin_users
    WHERE username = $1
    LIMIT 1
    `,
    [u]
  );

  return r.rows?.[0] ?? null;
}

export async function createAdminSession(adminId: string) {
  const sid = "admsess_" + randomBytes(24).toString("hex");

  await pool.query(
    `
    INSERT INTO admin_sessions (id, admin_id, created_at, expires_at)
    VALUES ($1, $2, NOW(), NOW() + interval '7 days')
    `,
    [sid, adminId]
  );

  return sid;
}

export async function getAdminFromSession(sessionId: string): Promise<AdminUser | null> {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;

  const r = await pool.query<{
    id: string;
    username: string;
    display_name: string | null;
  }>(
    `
    SELECT au.id, au.username, au.display_name
    FROM admin_sessions asn
    JOIN admin_users au ON au.id = asn.admin_id
    WHERE asn.id = $1
      AND asn.expires_at > NOW()
    LIMIT 1
    `,
    [sid]
  );

  const row = r.rows?.[0];
  if (!row) return null;

  return { id: row.id, username: row.username, displayName: row.display_name };
}

export async function revokeAdminSession(sessionId: string) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  await pool.query(`DELETE FROM admin_sessions WHERE id = $1`, [sid]);
}