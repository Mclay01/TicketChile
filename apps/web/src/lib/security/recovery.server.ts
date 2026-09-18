import "server-only";
import { withTx } from "@/lib/db";
import { AccessError } from "@/lib/access.server";
import { digest, randomToken, hashPassword, validPassword } from "./crypto.server";
import { findIdentity, principal, revokeAll, updatePassword, type IdentityKind } from "./identity.server";
import { audit } from "./audit.server";
import { queueSecurityMessage, type SecurityDelivery } from "./delivery.server";

export const recoveryResponse = {ok:true,message:"Si la cuenta permite recuperacion, recibiras instrucciones."};
export async function requestRecovery(kind: IdentityKind,login: string,delivery: SecurityDelivery = queueSecurityMessage) {
  const token=randomToken();
  const p=await findIdentity(kind,login);
  if (!p || !p.email || !p.verified || p.disabled || !p.active) return recoveryResponse;
  await withTx(async client=>{
    const account=await client.query("SELECT version FROM identity_accounts WHERE kind=$1 AND id=$2 FOR UPDATE",[kind,p.id]);
    const version=account.rows[0]?.version;
    // Do not invalidate an already-issued link on an unauthenticated new request.
    const pending=await client.query(`SELECT 1 FROM identity_tokens WHERE kind=$1 AND principal_id=$2 AND purpose='RESET'
      AND version=$3 AND used_at IS NULL AND expires_at>NOW()`,[kind,p.id,version]);
    if (pending.rowCount) return;
    const expiresAt=new Date(Date.now()+30*60000).toISOString();
    await client.query(`INSERT INTO identity_tokens(token_hash,kind,principal_id,purpose,version,expires_at)
      VALUES($1,$2,$3,'RESET',$4,$5)`,[digest(token),kind,p.id,version,expiresAt]);
    await delivery(client,{purpose:"RESET",kind,to:p.email!,token,expiresAt});
    await audit(client,{actor:{kind:"SYSTEM",id:"recovery"},action:"password.reset_requested",targetType:"identity",targetId:p.id});
  });
  return recoveryResponse;
}
export async function resetPassword(kind: IdentityKind,token: string,password: string) {
  if (!/^[a-f0-9]{64}$/.test(token) || !validPassword(password)) throw new AccessError(400,"INVALID_RESET","Solicitud invalida.");
  const hash=await hashPassword(password);
  await withTx(async client=>{
    const result=await client.query<{principal_id:string;version:number}>(`SELECT principal_id,version FROM identity_tokens
      WHERE token_hash=$1 AND kind=$2 AND purpose='RESET' AND used_at IS NULL AND expires_at>NOW() FOR UPDATE`,[digest(token),kind]);
    const row=result.rows[0];
    if (!row) throw new AccessError(400,"INVALID_RESET","Enlace invalido o expirado.");
    const account=await client.query("SELECT version FROM identity_accounts WHERE kind=$1 AND id=$2 FOR UPDATE",[kind,row.principal_id]);
    const p=await principal(kind,row.principal_id,client);
    if (!p || p.disabled || !p.active || !p.verified || account.rows[0]?.version!==row.version) throw new AccessError(400,"INVALID_RESET","Enlace invalido o expirado.");
    await updatePassword(client,p,hash);
    await client.query("UPDATE identity_tokens SET used_at=NOW() WHERE kind=$1 AND principal_id=$2 AND purpose='RESET' AND used_at IS NULL",[kind,p.id]);
    await revokeAll(client,p);
    await audit(client,{actor:p,action:"password.reset",targetType:"identity",targetId:p.id});
    // MFA stays enrolled; email possession cannot remove the second factor.
  });
}
