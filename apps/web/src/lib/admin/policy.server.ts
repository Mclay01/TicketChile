import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {pool,withTx} from '@/lib/db';
import {AccessError} from '@/lib/access.server';
import {cookieIdentity} from '@/lib/security/http.server';
import type {Principal} from '@/lib/security/identity.server';
import {audit} from '@/lib/security/audit.server';
import {lockInventory} from '@/lib/payments/inventory.server';
export const adminCapabilities=['operations.read','moderation.write','support.write','audit.read','reports.read','finance.read','refund.write','settlement.write','configuration.write'] as const;
export type AdminCapability=typeof adminCapabilities[number];
export function fail(message:string,code='INVALID_OPERATION',status=409):never{throw new AccessError(status,code,message);}
export function text(value:unknown,max=500){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('Completa el texto requerido.', 'INVALID_INPUT',400);return value.trim();}
export function integer(value:unknown,min:number,max:number){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)fail('Monto fuera de rango.','INVALID_INPUT',400);return value;}
export async function requireAdminCapability(cap:AdminCapability,actor?:Principal,db:Pool|PoolClient=pool){
 const p=actor||await cookieIdentity('ADMIN');
 if(!p)fail('Inicia sesión con autenticación de dos factores.','UNAUTHENTICATED',401);
 const r=await db.query('SELECT security_can_admin($1,$2,$3,$4) AS allowed',[p.kind,p.id,p.version,cap]);
 if(!r.rows[0]?.allowed)fail('Tu cuenta no tiene este permiso.','FORBIDDEN',403);
 return p;
}
export async function adminContext(){
 const p=await requireAdminCapability('operations.read');
 const r=await pool.query('SELECT c FROM unnest($4::text[]) c WHERE security_can_admin($1,$2,$3,c)',[p.kind,p.id,p.version,adminCapabilities]);
 return {id:p.id,name:p.name||p.login,role:p.role,capabilities:r.rows.map((r:{c:string})=>r.c)};
}
export type OperationInput={action:string;target:string;reason:string;confirmation:string;requestKey:string;[key:string]:unknown};
export async function operation<T>(input:OperationInput,cap:AdminCapability,run:(db:PoolClient,actor:Principal,id:string)=>Promise<{value:T;previous?:string;next?:string}>,actor?:Principal){
 const p=await requireAdminCapability(cap,actor);
 const reason=text(input.reason),key=text(input.requestKey,100),target=text(input.target,200);
 if(input.confirmation!==`${input.action} ${target}`)fail(`Escribe ${input.action} ${target} para confirmar.`);
 const fingerprint=createHash('sha256').update(JSON.stringify(Object.keys(input).filter(k=>k!=='requestKey').sort().map(k=>[k,input[k]]))).digest('hex');
 return withTx(async db=>{
  // Shared inventory ordering also serializes financial claims and identity changes.
  await lockInventory(db);await requireAdminCapability(cap,p,db);
  const prior=await db.query('SELECT id,fingerprint,actor_id FROM admin_operations WHERE request_key=$1',[key]);
  if(prior.rowCount){if(prior.rows[0].fingerprint!==fingerprint||prior.rows[0].actor_id!==p.id)fail('La clave ya corresponde a otra operación.','IDEMPOTENCY_CONFLICT');return {operationId:prior.rows[0].id,replayed:true};}
  const id=randomUUID(),result=await run(db,p,id);
  await db.query('INSERT INTO admin_operations(id,request_key,actor_id,action,target_id,reason,fingerprint,previous_state,new_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,key,p.id,input.action,target,reason,fingerprint,result.previous||null,result.next||null]);
  let organizerId:string|undefined,eventId:string|undefined;
  if(input.action==='organizer.review')organizerId=target;
  if(input.action==='event.moderate'||input.action==='settlement.create')eventId=target;
  if(input.action.startsWith('payment.')||input.action==='refund.request')eventId=(await db.query('SELECT event_id FROM payments WHERE id=$1',[target])).rows[0]?.event_id;
  else if(input.action.startsWith('refund.'))eventId=(await db.query('SELECT p.event_id FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.id::text=$1',[target])).rows[0]?.event_id;
  else if(input.action.startsWith('settlement.')&&input.action!=='settlement.create')eventId=(await db.query('SELECT event_id FROM settlements WHERE id::text=$1',[target])).rows[0]?.event_id;
  if(eventId)organizerId=(await db.query('SELECT organizer_id FROM organizer_events WHERE event_id=$1',[eventId])).rows[0]?.organizer_id;
  await audit(db,{actor:p,action:`admin.${input.action}`,targetType:'operation',targetId:target,organizerId,eventId,metadata:{outcome:result.next}});
  return {operationId:id,replayed:false,result:result.value};
 });
}
