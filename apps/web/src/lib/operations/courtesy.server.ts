import 'server-only';
import {randomUUID,createHash} from 'node:crypto';
import {pool,withTx} from '@/lib/db';
import {AccessError} from '@/lib/access.server';
import {readEvent} from '@/lib/organizer/events.server';
import {organizerActor} from '@/lib/security/capabilities.server';
import {audit} from '@/lib/security/audit.server';
import {limit} from '@/lib/security/rate-limit.server';
import {lockInventory,expireHoldsTx} from '@/lib/payments/inventory.server';
function fail(message:string):never{throw new AccessError(409,'COURTESY_INVALID',message);}
export async function issueCourtesy(eventId:string,b:Record<string,unknown>){
 const actor=await organizerActor();await readEvent(eventId,'courtesy.issue',undefined,actor);
 await limit('courtesy-issue',`${actor.kind}:${actor.id}`,{hits:60,seconds:3600});
 if(b.confirmed!==true)fail('Confirma el uso de inventario para esta cortesía.');
 const email=typeof b.email==='string'?b.email.trim().toLowerCase():'',name=typeof b.name==='string'?b.name.trim():'',reason=typeof b.reason==='string'?b.reason.trim():'',qty=b.qty,key=b.requestId;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||name.length<2||name.length>150||reason.length>500||typeof qty!=='number'||!Number.isSafeInteger(qty)||qty<1||qty>10||typeof key!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key)||typeof b.tierId!=='string')fail('Revisa destinatario, cantidad y tipo de entrada.');
 const fingerprint=createHash('sha256').update(JSON.stringify({eventId,email,name,reason,qty,tier:b.tierId})).digest('hex');
 return withTx(async client=>{
  await lockInventory(client);await expireHoldsTx(client);const e=await readEvent(eventId,'courtesy.issue',client,actor);
  const old=(await client.query('SELECT * FROM complimentary_issues WHERE actor_kind=$1 AND actor_id=$2 AND request_key=$3',[actor.kind,actor.id,key])).rows[0];
  if(old){if(old.request_hash!==fingerprint)fail('Esta solicitud ya se usó para otra cortesía.');return {orderId:old.order_id,id:old.id};}
  if(!['PUBLISHED','PAUSED'].includes(e.lifecycle)||!e.date_iso||new Date(e.date_iso)<=new Date())fail('Emite cortesías solo para eventos publicados o pausados, antes de su inicio.');
  const tier=e.tiers.find(t=>t.id===b.tierId);if(!tier)fail('Tipo de entrada no disponible.');
  const stock=await client.query('UPDATE ticket_types SET sold=sold+$3 WHERE event_id=$1 AND id=$2 AND capacity-sold-held>=$3 RETURNING id',[eventId,tier.id,qty]);if(!stock.rowCount)fail('No queda capacidad disponible en esta asignación.');
  const hold=`courtesy_${randomUUID()}`,order=`ord_${randomUUID()}`,id=randomUUID();
  await client.query("INSERT INTO holds(id,event_id,status,expires_at,owner_email) VALUES($1,$2,'CONSUMED',now(),$3)",[hold,eventId,email]);
  await client.query('INSERT INTO hold_items(hold_id,event_id,ticket_type_id,ticket_type_name,unit_price_clp,qty) VALUES($1,$2,$3,$4,0,$5)',[hold,eventId,tier.id,tier.name,qty]);
  await client.query('INSERT INTO orders(id,hold_id,event_id,event_title,buyer_name,buyer_email,owner_email) VALUES($1,$2,$3,$4,$5,$6,$6)',[order,hold,eventId,e.title,name,email]);
  await client.query('INSERT INTO complimentary_issues(id,order_id,event_id,ticket_type_id,qty,actor_kind,actor_id,request_key,request_hash,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,order,eventId,tier.id,qty,actor.kind,actor.id,key,fingerprint,reason]);
  for(let i=1;i<=qty;i++){const ticket=`tix_${randomUUID()}`;await client.query("INSERT INTO tickets(id,order_id,event_id,ticket_type_id,ticket_type_name,buyer_email,owner_email,status,issuance_index) VALUES($1,$2,$3,$4,$5,$6,$6,'VALID',$7)",[ticket,order,eventId,tier.id,tier.name,email,i]);await client.query("INSERT INTO mail_jobs(id,dedupe_key,purpose,source_id,recipient) VALUES($1,$2,'TICKET',$3,$4)",[randomUUID(),`initial:${ticket}`,ticket,email]);}
  await audit(client,{actor,organizerId:e.organizer_id,eventId,action:'courtesy.issued',targetType:'courtesy',targetId:id,metadata:{outcome:'INVENTORY_CONFIRMED'}});return {orderId:order,id};
 });
}
export async function revokeCourtesy(eventId:string,ticketId:unknown,reason:unknown){
 const actor=await organizerActor();await readEvent(eventId,'courtesy.revoke',undefined,actor);
 if(typeof ticketId!=='string'||typeof reason!=='string'||reason.trim().length<3||reason.length>500)fail('Indica el ticket y el motivo.');
 await limit('courtesy-revoke',`${actor.kind}:${actor.id}`,{hits:60,seconds:3600});
 return withTx(async client=>{await lockInventory(client);const e=await readEvent(eventId,'courtesy.revoke',client,actor);
  const changed=await client.query(`UPDATE tickets t SET status='CANCELLED' WHERE id=$1 AND event_id=$2 AND status='VALID' AND EXISTS(SELECT 1 FROM complimentary_issues c WHERE c.order_id=t.order_id AND c.event_id=t.event_id) RETURNING id`,[ticketId,eventId]);
  if(!changed.rowCount)fail('Solo puedes revocar una cortesía sin usar.');
  await client.query("INSERT INTO courtesy_revocations(ticket_id,actor_kind,actor_id,reason) VALUES($1,$2,$3,$4)",[ticketId,actor.kind,actor.id,reason.trim()]);
  await audit(client,{actor,organizerId:e.organizer_id,eventId,action:'courtesy.revoked',targetType:'ticket',targetId:ticketId});return {ok:true};
 });
}
export async function courtesyHistory(eventId:string){await readEvent(eventId,'courtesy.issue');return (await pool.query('SELECT id,order_id,ticket_type_id,qty,actor_kind,actor_id,reason,created_at FROM complimentary_issues WHERE event_id=$1 ORDER BY created_at DESC LIMIT 50',[eventId])).rows;}
