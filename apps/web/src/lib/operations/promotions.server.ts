import 'server-only';
import {randomUUID} from 'node:crypto';
import {pool,withTx} from '@/lib/db';
import {readEvent} from '@/lib/organizer/events.server';
import {organizerActor} from '@/lib/security/capabilities.server';
import {audit} from '@/lib/security/audit.server';
import {limit} from '@/lib/security/rate-limit.server';
import {lockInventory} from '@/lib/payments/inventory.server';
import {codeValue,invalid} from './promotion-pricing.server';
export async function promotions(id:string){await readEvent(id,'promotions.manage');return JSON.parse(JSON.stringify((await pool.query(`SELECT p.*,
 (SELECT count(*)::int FROM promotion_reservations r JOIN holds h ON h.id=r.hold_id WHERE r.promotion_id=p.id AND h.status='CONSUMED') AS used,
 (SELECT count(*)::int FROM promotion_reservations r JOIN holds h ON h.id=r.hold_id WHERE r.promotion_id=p.id AND h.status='ACTIVE' AND h.expires_at>now()) AS reserved
 FROM promotions p WHERE event_id=$1 ORDER BY created_at DESC LIMIT 200`,[id])).rows));}
export async function savePromotion(id:string,b:Record<string,unknown>){
 const actor=await organizerActor();await readEvent(id,'promotions.manage',undefined,actor);await limit('promotion-change',`${actor.kind}:${actor.id}`,{hits:60,seconds:3600});
 if(b.confirmed!==true)invalid('Confirma los valores y el estado de esta promoción.');
 return withTx(async client=>{
  await lockInventory(client);const e=await readEvent(id,'promotions.manage',client,actor);if(['ENDED','CANCELLED'].includes(e.lifecycle))invalid('Evento cerrado.');
  if(b.action==='toggle'){
   if(typeof b.active!=='boolean'||typeof b.id!=='string')invalid();const changed=await client.query('UPDATE promotions SET active=$3,updated_at=now() WHERE id::text=$1 AND event_id=$2 RETURNING id',[b.id,id,b.active]);if(!changed.rowCount)invalid();
   await audit(client,{actor,eventId:id,organizerId:e.organizer_id,action:b.active?'promotion.activated':'promotion.deactivated',targetType:'promotion',targetId:b.id});return {id:b.id};
  }
  const code=codeValue(b.code),kind=b.kind,value=b.value,usage=b.usageLimit,tiers=b.tierIds;
  if(!code||typeof kind!=='string'||!['PERCENT','FIXED'].includes(kind)||typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>(kind==='PERCENT'?99:100000000)||typeof usage!=='number'||!Number.isSafeInteger(usage)||usage<1||usage>1000000||!Array.isArray(tiers)||tiers.length>50||tiers.some(t=>typeof t!=='string'||!e.tiers.some(et=>et.id===t)))invalid('Revisa descuento, límite y tipos de entrada.');
  if(typeof b.startsAt!=='string'||typeof b.endsAt!=='string'||!Number.isFinite(Date.parse(b.startsAt))||!Number.isFinite(Date.parse(b.endsAt))||new Date(b.startsAt)>=new Date(b.endsAt)||new Date(b.endsAt)<=new Date())invalid('Ventana de vigencia inválida.');
  if((await client.query('SELECT 1 FROM promotions WHERE event_id=$1 AND code=$2',[id,code])).rowCount)invalid('Este código ya existe en el evento.');
  const key=randomUUID();await client.query(`INSERT INTO promotions(id,event_id,code,kind,value,tier_ids,usage_limit,starts_at,ends_at,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,false)`,[key,id,code,kind,value,tiers,usage,b.startsAt,b.endsAt]);
  await audit(client,{actor,eventId:id,organizerId:e.organizer_id,action:'promotion.created',targetType:'promotion',targetId:key});return {id:key};
 });
}
