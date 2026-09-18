import "server-only";
import { randomUUID } from "node:crypto";
import { withTx } from "@/lib/db";
import { AccessError } from "@/lib/access.server";
import { digest,randomToken } from "./crypto.server";
import { requestedCapabilities,requireOrganizerCapability } from "./capabilities.server";
import type { Principal } from "./identity.server";
import { audit } from "./audit.server";
import { queueSecurityMessage,type SecurityDelivery } from "./delivery.server";

export async function inviteStaff(actor:Principal,input:{organizerId:string;email:string;role:unknown;capabilities?:unknown;eventIds?:unknown},delivery:SecurityDelivery=queueSecurityMessage){
  await requireOrganizerCapability(input.organizerId,"staff.manage",actor);
  const email=input.email.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AccessError(400,"INVALID_INPUT","Email invalido.");
  const grant=requestedCapabilities(input.role,input.capabilities);
  const eventIds=input.eventIds===undefined||input.eventIds===null?null:input.eventIds;
  if(eventIds!==null&&(!Array.isArray(eventIds)||!eventIds.length||!eventIds.every(id=>typeof id==="string"&&id.length<=200)))throw new AccessError(400,"INVALID_INPUT","Eventos invalidos.");
  return withTx(async client=>{
    // Serialize scope changes and invites with the tenant row.
    await client.query("SELECT id FROM organizer_users WHERE id=$1 FOR UPDATE",[input.organizerId]);
    if(eventIds){
      const scoped=await client.query("SELECT event_id FROM organizer_events WHERE organizer_id=$1 AND event_id=ANY($2::text[])",[input.organizerId,eventIds]);
      if(scoped.rowCount!==new Set(eventIds).size)throw new AccessError(403,"NOT_AUTHORIZED","Evento fuera de alcance.");
    }
    await client.query("UPDATE organizer_invites SET revoked_at=NOW() WHERE organizer_id=$1 AND lower(email)=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at<=NOW()",[input.organizerId,email]);
    const duplicate=await client.query("SELECT 1 FROM organizer_invites WHERE organizer_id=$1 AND lower(email)=$2 AND accepted_at IS NULL AND revoked_at IS NULL",[input.organizerId,email]);
    if(duplicate.rowCount)throw new AccessError(409,"INVITE_PENDING","Ya existe una invitacion pendiente.");
    const token=randomToken(),id=randomUUID(),expiresAt=new Date(Date.now()+48*3600000).toISOString();
    await client.query(`INSERT INTO organizer_invites(id,organizer_id,email,role,capabilities,event_ids,token_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,input.organizerId,email,grant.role,grant.capabilities,eventIds,digest(token),expiresAt]);
    await delivery(client,{purpose:"INVITE",to:email,token,expiresAt});
    await audit(client,{actor,action:"staff.invited",organizerId:input.organizerId,targetType:"invite",targetId:id,metadata:{role:grant.role}});
    return {id,expiresAt};
  });
}
export async function acceptInvite(actor:Principal,token:string){
  if(actor.kind!=="BUYER"||!actor.verified||!actor.email||!actor.active||actor.disabled)throw new AccessError(403,"NOT_AUTHORIZED","Se requiere una cuenta verificada.");
  const actorEmail=actor.email.toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(token))throw new AccessError(400,"INVALID_INVITE","Invitacion invalida.");
  return withTx(async client=>{
    const result=await client.query<{id:string;organizer_id:string;email:string;role:string;capabilities:string[];event_ids:string[]|null}>(
      `SELECT i.* FROM organizer_invites i JOIN organizer_users o ON o.id=i.organizer_id
       JOIN identity_accounts tenant ON tenant.kind='ORGANIZER' AND tenant.id=o.id AND NOT tenant.disabled
       WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>NOW()
       AND o.is_active AND o.approved AND o.verified FOR UPDATE OF i`,[digest(token)]);
    const invite=result.rows[0];
    if(!invite||invite.email.toLowerCase()!==actorEmail)throw new AccessError(400,"INVALID_INVITE","Invitacion invalida o expirada.");
    const existing=await client.query("SELECT id FROM organizer_staff WHERE organizer_id=$1 AND buyer_id=$2 AND revoked_at IS NULL",[invite.organizer_id,actor.id]);
    if(existing.rowCount)throw new AccessError(409,"ALREADY_MEMBER","La cuenta ya tiene acceso. Modifica sus permisos desde administracion de staff.");
    const id=randomUUID();
    const row=await client.query<{id:string}>(`INSERT INTO organizer_staff(id,organizer_id,buyer_id,role,capabilities,event_ids)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organizer_id,buyer_id) DO UPDATE SET role=EXCLUDED.role,
      capabilities=EXCLUDED.capabilities,event_ids=EXCLUDED.event_ids,revoked_at=NULL RETURNING id`,
    [id,invite.organizer_id,actor.id,invite.role,invite.capabilities,invite.event_ids]);
    await client.query("UPDATE organizer_invites SET accepted_at=NOW() WHERE id=$1",[invite.id]);
    await audit(client,{actor,action:"staff.invite_accepted",organizerId:invite.organizer_id,targetType:"staff",targetId:row.rows[0].id,metadata:{role:invite.role}});
    return {organizerId:invite.organizer_id};
  });
}
export async function revokeStaff(actor:Principal,organizerId:string,id:string,invite=false){
  await requireOrganizerCapability(organizerId,"staff.manage",actor);
  return withTx(async client=>{
    const table=invite?"organizer_invites":"organizer_staff";
    const result=await client.query(`UPDATE ${table} SET revoked_at=NOW() WHERE id::text=$1 AND organizer_id=$2 RETURNING id`,[id,organizerId]);
    if(!result.rowCount)throw new AccessError(404,"NOT_FOUND","Registro no encontrado.");
    await audit(client,{actor,action:invite?"staff.invite_revoked":"staff.revoked",organizerId,targetType:invite?"invite":"staff",targetId:id});
  });
}
export async function updateStaff(actor:Principal,input:{organizerId:string;id:string;role:unknown;capabilities?:unknown;eventIds?:unknown}){
  await requireOrganizerCapability(input.organizerId,"staff.manage",actor);
  const grant=requestedCapabilities(input.role,input.capabilities);
  const eventIds=input.eventIds===undefined||input.eventIds===null?null:input.eventIds;
  if(eventIds!==null&&(!Array.isArray(eventIds)||!eventIds.length||!eventIds.every(id=>typeof id==="string"&&id.length<=200)))
    throw new AccessError(400,"INVALID_INPUT","Eventos invalidos.");
  await withTx(async client=>{
    await client.query("SELECT id FROM organizer_users WHERE id=$1 FOR UPDATE",[input.organizerId]);
    if(eventIds){
      const events=await client.query("SELECT event_id FROM organizer_events WHERE organizer_id=$1 AND event_id=ANY($2::text[])",[input.organizerId,eventIds]);
      if(events.rowCount!==new Set(eventIds).size)throw new AccessError(403,"NOT_AUTHORIZED","Evento fuera de alcance.");
    }
    const changed=await client.query(`UPDATE organizer_staff SET role=$3,capabilities=$4,event_ids=$5
      WHERE id::text=$1 AND organizer_id=$2 AND revoked_at IS NULL RETURNING id`,[input.id,input.organizerId,grant.role,grant.capabilities,eventIds]);
    if(!changed.rowCount)throw new AccessError(404,"NOT_FOUND","Staff no disponible.");
    await audit(client,{actor,organizerId:input.organizerId,action:"staff.permissions_changed",targetType:"staff",targetId:input.id,metadata:{role:grant.role}});
  });
}
