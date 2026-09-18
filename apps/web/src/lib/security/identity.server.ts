import "server-only";
import { pool, withTx } from "@/lib/db";
import type { Pool, PoolClient } from "pg";
import { digest, randomToken, hashPassword, verifyPassword, validPassword } from "./crypto.server";
import { AccessError } from "@/lib/access.server";
import { audit } from "./audit.server";
export type IdentityKind = "BUYER" | "ORGANIZER" | "ADMIN";
export type Principal = {
  kind: IdentityKind; id: string; email: string | null; login: string; name: string | null;
  password_hash: string; verified: boolean; active: boolean; role: string;
  version: number; disabled: boolean; mfa_required: boolean; mfa_enabled: boolean;
};
export function identityKind(value: unknown): IdentityKind {
  if (value === "BUYER" || value === "ORGANIZER" || value === "ADMIN") return value;
  throw new AccessError(400, "INVALID_INPUT", "Tipo de cuenta invalido.");
}
export async function principal(kind: IdentityKind, id: string, db: Pool | PoolClient = pool) {
  const result = await db.query<Principal>(`SELECT p.*,a.version,a.disabled,a.mfa_required,COALESCE(m.enabled,false) AS mfa_enabled
    FROM identity_principals p JOIN identity_accounts a ON a.kind=p.kind AND a.id=p.id
    LEFT JOIN identity_mfa m ON m.kind=p.kind AND m.principal_id=p.id WHERE p.kind=$1 AND p.id=$2`, [kind, id]);
  return result.rows[0] || null;
}
export function eligible(p: Principal | null): p is Principal {
  return !!p && p.active && !p.disabled && (p.kind === "ADMIN" || p.verified);
}
export async function findIdentity(kind: IdentityKind, login: string) {
  const result = await pool.query<{ id: string }>(`SELECT id FROM identity_principals WHERE kind=$1 AND (lower(login)=$2 OR lower(email)=$2)`, [kind, login.trim().toLowerCase()]);
  return result.rows.length === 1 ? principal(kind, result.rows[0].id) : null;
}
export async function updatePassword(db: PoolClient, p: Pick<Principal,"kind"|"id">, hash: string) {
  const table = { BUYER: "usuarios", ORGANIZER: "organizer_users", ADMIN: "admin_users" }[p.kind];
  await db.query(`UPDATE ${table} SET password_hash=$2 WHERE id::text=$1`, [p.id, hash]);
}
export async function authenticate(kind: IdentityKind, login: string, password: string) {
  const p = await findIdentity(kind, login);
  // Same expensive operation for an unknown account; bounds are checked by callers.
  if (!p) {
    await verifyPassword(password, "scrypt-v2$131072$8$1$" + "11".repeat(16) + "$" + "22".repeat(64));
    return null;
  }
  if (!await verifyPassword(password, p.password_hash) || !eligible(p)) return null;
  if (!p.password_hash.startsWith("scrypt-v2$") && validPassword(password)) {
    const hash = await hashPassword(password);
    await withTx(async client => {
      const table = { BUYER: "usuarios", ORGANIZER: "organizer_users", ADMIN: "admin_users" }[kind];
      await client.query(`UPDATE ${table} SET password_hash=$2 WHERE id::text=$1 AND password_hash=$3`, [p.id, hash, p.password_hash]);
    });
  }
  return p;
}
export async function createSession(p: Principal, mfaVerified = false) {
  const token = randomToken();
  // Compare the credential version under a lock: a reset racing login wins.
  await withTx(async client => {
    const account = await client.query(`SELECT version FROM identity_accounts WHERE kind=$1 AND id=$2 AND disabled=false FOR UPDATE`, [p.kind, p.id]);
    if (account.rows[0]?.version !== p.version) throw new AccessError(401,"SESSION_INVALID","Inicia sesion nuevamente.");
    await client.query(`INSERT INTO identity_sessions(token_hash,kind,principal_id,version,mfa_verified,expires_at)
      VALUES ($1,$2,$3,$4,$5,NOW()+($6::int*interval '1 second'))`,
    [digest(token),p.kind,p.id,p.version,mfaVerified,(p.mfa_required || p.mfa_enabled) && !mfaVerified ? 600 : p.kind === "BUYER" ? 604800 : 28800]);
    await audit(client,{actor:p,action:"session.created",targetType:"identity",targetId:p.id});
  });
  return token;
}
export async function readSession(token: string, kind: IdentityKind, allowPending = false) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await pool.query<{ principal_id: string; version: number; mfa_verified: boolean }>(
    `SELECT principal_id,version,mfa_verified FROM identity_sessions WHERE token_hash=$1 AND kind=$2
     AND revoked_at IS NULL AND expires_at>NOW()`, [digest(token),kind]);
  const session = result.rows[0]; if (!session) return null;
  const p = await principal(kind,session.principal_id);
  if (!eligible(p) || p.version !== session.version) return null;
  const ready = !(p.mfa_required || p.mfa_enabled) || session.mfa_verified;
  return ready || allowPending ? { ...p, ready, mfaVerified: session.mfa_verified, sessionHash: digest(token) } : null;
}
export async function revokeSession(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  await withTx(async client=>{
    const result=await client.query<{kind:IdentityKind;principal_id:string}>("UPDATE identity_sessions SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL RETURNING kind,principal_id",[digest(token)]);
    const session=result.rows[0];
    if(session)await audit(client,{actor:{kind:session.kind,id:session.principal_id},action:"session.revoked",targetType:"identity",targetId:session.principal_id});
  });
}
export async function revokeAll(client: PoolClient, p: Pick<Principal,"kind"|"id">) {
  await client.query("UPDATE identity_accounts SET version=version+1 WHERE kind=$1 AND id=$2", [p.kind,p.id]);
  await client.query("UPDATE identity_sessions SET revoked_at=NOW() WHERE kind=$1 AND principal_id=$2 AND revoked_at IS NULL", [p.kind,p.id]);
}
