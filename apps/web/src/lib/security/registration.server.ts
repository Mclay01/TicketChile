import "server-only";
import { randomUUID } from "node:crypto";
import { withTx } from "@/lib/db";
import { AccessError,accessResponse,privateJson,requireSameOrigin } from "@/lib/access.server";
import { digest,randomToken,hashPassword,validPassword } from "./crypto.server";
import { queueSecurityMessage,type SecurityDelivery } from "./delivery.server";
import { audit } from "./audit.server";
import { publicLimit } from "./rate-limit.server";
import { readBody,stringValue } from "./http.server";
import { findIdentity,type IdentityKind } from "./identity.server";

export async function requestVerification(kind:IdentityKind,login:string,delivery:SecurityDelivery=queueSecurityMessage){
  const response={ok:true,message:"Si la cuenta requiere verificacion, recibiras instrucciones."};
  if(kind==="ADMIN")return response;
  const p=await findIdentity(kind,login);
  if(!p||p.verified||p.disabled||!p.email)return response;
  const email=p.email;
  await withTx(async client=>{
    const account=await client.query("SELECT version FROM identity_accounts WHERE kind=$1 AND id=$2 FOR UPDATE",[kind,p.id]);
    if(account.rows[0]?.version!==p.version)return;
    const pending=await client.query("SELECT 1 FROM identity_tokens WHERE kind=$1 AND principal_id=$2 AND purpose='VERIFY' AND version=$3 AND used_at IS NULL AND expires_at>NOW()",[kind,p.id,p.version]);
    if(pending.rowCount)return;
    const token=randomToken(),expiresAt=new Date(Date.now()+86400000).toISOString();
    await client.query("INSERT INTO identity_tokens(token_hash,kind,principal_id,purpose,version,expires_at) VALUES($1,$2,$3,'VERIFY',$4,$5)",[digest(token),kind,p.id,p.version,expiresAt]);
    await delivery(client,{purpose:"VERIFY",kind,to:email,token,expiresAt});
    await audit(client,{actor:{kind:"SYSTEM",id:"verification"},action:"identity.verification_requested",targetType:kind,targetId:p.id});
  });
  return response;
}

export async function register(kind:"BUYER"|"ORGANIZER",input:{email:string;password:string;name:string},delivery:SecurityDelivery=queueSecurityMessage){
  const email=input.email.trim().toLowerCase();
  if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!validPassword(input.password))
    throw new AccessError(400,"INVALID_INPUT","Email invalido o clave menor a 12 caracteres (maximo 256 bytes).");
  const hash=await hashPassword(input.password);
  return withTx(async client=>{
    // Serialize normalized identity creation; no duplicate mixed-case principals.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`register:${kind}:${email}`]);
    const exists=await client.query("SELECT 1 FROM identity_principals WHERE kind=$1 AND lower(email)=$2",[kind,email]);
    if(exists.rowCount)return;
    const id=kind==="BUYER"?randomUUID():`org_${randomToken().slice(0,24)}`;
    if(kind==="BUYER")await client.query("INSERT INTO usuarios(id,email,nombre,password_hash) VALUES($1,$2,$3,$4)",[id,email,input.name.slice(0,160)||"Usuario",hash]);
    else await client.query(`INSERT INTO organizer_users(id,username,email,display_name,password_hash,verified,approved)
      VALUES($1,$2,$2,$3,$4,false,false)`,[id,email,input.name.slice(0,160)||"Organizador",hash]);
    const token=randomToken(),expiresAt=new Date(Date.now()+86400000).toISOString();
    await client.query(`INSERT INTO identity_tokens(token_hash,kind,principal_id,purpose,version,expires_at)
      VALUES($1,$2,$3,'VERIFY',1,$4)`,[digest(token),kind,id,expiresAt]);
    await delivery(client,{purpose:"VERIFY",kind,to:email,token,expiresAt});
    await audit(client,{actor:{kind:"SYSTEM",id:"registration"},action:"identity.registered",targetType:kind,targetId:id});
  });
}
export async function verifyEmail(kind:IdentityKind,token:string){
  if(kind==="ADMIN"||! /^[a-f0-9]{64}$/.test(token))throw new AccessError(400,"INVALID_TOKEN","Token invalido.");
  await withTx(async client=>{
    const found=await client.query<{principal_id:string;version:number}>(`SELECT principal_id,version FROM identity_tokens
      WHERE token_hash=$1 AND kind=$2 AND purpose='VERIFY' AND used_at IS NULL AND expires_at>NOW() FOR UPDATE`,[digest(token),kind]);
    const row=found.rows[0];
    if(!row)throw new AccessError(400,"INVALID_TOKEN","Token invalido o expirado.");
    const account=await client.query("SELECT version FROM identity_accounts WHERE kind=$1 AND id=$2 AND NOT disabled FOR UPDATE",[kind,row.principal_id]);
    if(account.rows[0]?.version!==row.version)throw new AccessError(400,"INVALID_TOKEN","Token invalido.");
    if(kind==="BUYER")await client.query("UPDATE usuarios SET email_verified_at=NOW() WHERE id=$1",[row.principal_id]);
    else await client.query("UPDATE organizer_users SET verified=true WHERE id=$1",[row.principal_id]);
    await client.query("UPDATE identity_tokens SET used_at=NOW() WHERE kind=$1 AND principal_id=$2 AND purpose='VERIFY'",[kind,row.principal_id]);
    await audit(client,{actor:{kind,id:row.principal_id},action:"identity.email_verified",targetType:kind,targetId:row.principal_id});
  });
}
export async function registrationHandler(req:Request,kind:"BUYER"|"ORGANIZER"){
  try{
    requireSameOrigin(req);const body=await readBody(req);
    const email=stringValue(body.email);
    await publicLimit(req,"register",`${kind}:${email}`,{hits:5,seconds:900});
    await register(kind,{email,password:stringValue(body.password),name:stringValue(body.nombre||body.name||body.displayName||body.legalName)});
    return privateJson(200,{ok:true,message:"Si la cuenta puede registrarse, recibiras instrucciones de verificacion.",delivery:"queued"});
  }catch(error){return accessResponse(error);}
}
export async function verificationHandler(req:Request,kind:"BUYER"|"ORGANIZER"){
  try{
    requireSameOrigin(req);const body=await readBody(req);const token=stringValue(body.token||body.code);
    await publicLimit(req,"verify-email",token.slice(0,64),{hits:10,seconds:900});
    await verifyEmail(kind,token);return privateJson(200,{ok:true});
  }catch(error){return accessResponse(error);}
}
