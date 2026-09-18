import "server-only";
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import { AccessError } from "@/lib/access.server";
import { base32, digest, matchTotp, randomToken, seal, unseal, verifyPassword } from "./crypto.server";
import { principal, revokeAll, type Principal } from "./identity.server";
import { audit } from "./audit.server";
import { limit } from "./rate-limit.server";

type MfaRow = { enabled: boolean; secret_cipher: string; pending_cipher: string; pending_expires_at: Date;
  last_counter: string; recovery_hashes: string[] };
const context = (p: Pick<Principal,"kind"|"id">) => `mfa:${p.kind}:${p.id}`;
const rejected = () => new AccessError(401,"MFA_INVALID","Codigo invalido o expirado.");

export async function verifyMfaTx(client: PoolClient,p: Principal,code: string) {
  const result = await client.query<MfaRow>(`SELECT * FROM identity_mfa WHERE kind=$1 AND principal_id=$2 FOR UPDATE`,[p.kind,p.id]);
  const row = result.rows[0]; if (!row?.enabled) throw rejected();
  const recoveryHash = digest(`recovery:${context(p)}:${code}`);
  if (/^[a-f0-9]{24}$/.test(code) && row.recovery_hashes.includes(recoveryHash)) {
    await client.query(`UPDATE identity_mfa SET recovery_hashes=array_remove(recovery_hashes,$3) WHERE kind=$1 AND principal_id=$2`,[p.kind,p.id,recoveryHash]);
    await audit(client,{actor:p,action:"mfa.recovery_used",targetType:"identity",targetId:p.id});
    return;
  }
  const counter = matchTotp(unseal(row.secret_cipher,context(p)),code,Number(row.last_counter));
  if (counter === null) throw rejected();
  await client.query("UPDATE identity_mfa SET last_counter=$3 WHERE kind=$1 AND principal_id=$2",[p.kind,p.id,counter]);
}
export async function verifyMfa(p: Principal,code: string) {
  await limit("mfa",`${p.kind}:${p.id}`,{hits:12,seconds:300});
  await withTx(async client => {
    const account=await client.query("SELECT version FROM identity_accounts WHERE kind=$1 AND id=$2 AND NOT disabled FOR UPDATE",[p.kind,p.id]);
    if(account.rows[0]?.version!==p.version)throw rejected();
    await verifyMfaTx(client,p,code);
  });
}
export async function beginEnrollment(p: Principal,password: string,code = "") {
  await limit("mfa-change",`${p.kind}:${p.id}`,{hits:6,seconds:900});
  if (!await verifyPassword(password,p.password_hash)) throw rejected();
  const secret = base32(randomBytes(20));
  await withTx(async client => {
    await client.query("SELECT version FROM identity_accounts WHERE kind=$1 AND id=$2 FOR UPDATE",[p.kind,p.id]);
    const fresh = await principal(p.kind,p.id,client);
    if (!fresh || fresh.version !== p.version) throw rejected();
    if (fresh.mfa_enabled) await verifyMfaTx(client,fresh,code);
    await client.query(`INSERT INTO identity_mfa(kind,principal_id,pending_cipher,pending_expires_at)
      VALUES($1,$2,$3,NOW()+interval '10 minutes') ON CONFLICT(kind,principal_id)
      DO UPDATE SET pending_cipher=EXCLUDED.pending_cipher,pending_expires_at=EXCLUDED.pending_expires_at`,[p.kind,p.id,seal(secret,context(p))]);
    await audit(client,{actor:p,action:"mfa.enrollment_started",targetType:"identity",targetId:p.id});
  });
  return { secret, uri:`otpauth://totp/${encodeURIComponent(`TicketChile:${p.login}`)}?secret=${secret}&issuer=TicketChile&algorithm=SHA1&digits=6&period=30` };
}
export async function confirmEnrollment(p: Principal,code: string) {
  await limit("mfa",`${p.kind}:${p.id}`,{hits:12,seconds:300});
  return withTx(async client => {
    const account = await client.query("SELECT version FROM identity_accounts WHERE kind=$1 AND id=$2 FOR UPDATE",[p.kind,p.id]);
    if (account.rows[0]?.version !== p.version) throw rejected();
    const result = await client.query<MfaRow>("SELECT * FROM identity_mfa WHERE kind=$1 AND principal_id=$2 FOR UPDATE",[p.kind,p.id]);
    const row = result.rows[0];
    if (!row?.pending_cipher || new Date(row.pending_expires_at).getTime()<=Date.now()) throw rejected();
    const counter = matchTotp(unseal(row.pending_cipher,context(p)),code,-1); if (counter===null) throw rejected();
    const recoveryCodes = Array.from({length:10},()=>randomToken().slice(0,24));
    await client.query(`UPDATE identity_mfa SET secret_cipher=pending_cipher,pending_cipher=NULL,pending_expires_at=NULL,
      enabled=true,last_counter=$3,recovery_hashes=$4 WHERE kind=$1 AND principal_id=$2`,
    [p.kind,p.id,counter,recoveryCodes.map(value=>digest(`recovery:${context(p)}:${value}`))]);
    await revokeAll(client,p);
    await audit(client,{actor:p,action:"mfa.enabled",targetType:"identity",targetId:p.id});
    return {recoveryCodes,version:p.version+1};
  });
}
export async function disableMfa(p: Principal,password: string,code: string) {
  await limit("mfa-change",`${p.kind}:${p.id}`,{hits:6,seconds:900});
  if (!await verifyPassword(password,p.password_hash)) throw rejected();
  await withTx(async client => {
    const account = await client.query("SELECT version FROM identity_accounts WHERE kind=$1 AND id=$2 FOR UPDATE",[p.kind,p.id]);
    if (account.rows[0]?.version !== p.version) throw rejected();
    await verifyMfaTx(client,p,code);
    await client.query(`UPDATE identity_mfa SET enabled=false,secret_cipher=NULL,pending_cipher=NULL,
      pending_expires_at=NULL,recovery_hashes='{}',last_counter=-1 WHERE kind=$1 AND principal_id=$2`,[p.kind,p.id]);
    await revokeAll(client,p);
    await audit(client,{actor:p,action:"mfa.disabled",targetType:"identity",targetId:p.id});
  });
  // Required-MFA principals can only enroll again; disabling does not remove policy.
}
