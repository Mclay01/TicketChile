import 'server-only';
import {randomUUID} from 'node:crypto';
import {operation,fail,text,integer,type OperationInput} from './policy.server';
import type {Principal} from '@/lib/security/identity.server';
import {transitionEventTx} from '@/lib/organizer/events.server';
import type {EventRecord} from '@/lib/organizer/model';

export async function moderate(input:OperationInput,actor?:Principal){
 return operation<Record<string,unknown>>(input,'moderation.write',async(db,p)=>{
  if(input.action==='organizer.review'){
   const next=text(input.state,30);if(!['NEEDS_INFORMATION','APPROVED','REJECTED','SUSPENDED'].includes(next))fail('Estado inválido.');
   const r=await db.query('SELECT review_state,verified FROM organizer_users WHERE id=$1 FOR UPDATE',[input.target]);if(!r.rowCount)fail('Organizador no encontrado.');
   if(next==='APPROVED'&&!r.rows[0].verified)fail('El correo del organizador debe estar verificado.');
   await db.query("UPDATE organizer_users SET review_state=$2,approved=($2='APPROVED'),is_active=($2<>'SUSPENDED') WHERE id=$1",[input.target,next]);
   await db.query("UPDATE identity_accounts SET version=version+1 WHERE kind='ORGANIZER' AND id=$1",[input.target]);
   return {value:{state:next},previous:r.rows[0].review_state,next};
  }
  if(input.action!=='event.moderate')fail('Operación no disponible.');
  const r=await db.query(`SELECT e.*,oe.organizer_id,o.display_name AS organizer_name,
   COALESCE((SELECT jsonb_agg(t) FROM ticket_types t WHERE t.event_id=e.id),'[]') AS tiers
   FROM events e JOIN organizer_events oe ON oe.event_id=e.id JOIN organizer_users o ON o.id=oe.organizer_id WHERE e.id=$1 FOR UPDATE OF e`,[input.target]);
  if(!r.rowCount)fail('Evento no encontrado.');
  const e=JSON.parse(JSON.stringify(r.rows[0])) as EventRecord;
  if(input.state==='CHANGES_REQUESTED'){
   if(e.revision!==input.revision)fail('Recarga la versión actual.');
   if(!['DRAFT','IN_REVIEW','PAUSED'].includes(e.lifecycle))fail('Pausa el evento antes de solicitar cambios.');
   await db.query("UPDATE events SET moderation_block=true,revision=revision+1,updated_at=now() WHERE id=$1",[e.id]);
   return {value:{state:'CHANGES_REQUESTED'},previous:e.lifecycle,next:'CHANGES_REQUESTED'};
  }
  if(!['PUBLISHED','PAUSED','CANCELLED','ENDED'].includes(String(input.state)))fail('Estado inválido.');
  if(input.state==='PUBLISHED'){
   const owner=await db.query("SELECT 1 FROM organizer_users o JOIN identity_accounts a ON a.kind='ORGANIZER' AND a.id=o.id WHERE o.id=$1 AND o.approved AND o.verified AND o.is_active AND NOT a.disabled",[e.organizer_id]);
   if(!owner.rowCount)fail('El organizador no está habilitado.');
   await db.query('UPDATE events SET moderation_block=false WHERE id=$1',[e.id]);
  }
  const value=await transitionEventTx(db,p,e,input.revision,input.state,input.state==='CANCELLED'?`CANCELAR ${e.id}`:input.state);
  if(input.state==='PAUSED')await db.query('UPDATE events SET moderation_block=true WHERE id=$1',[e.id]);
  return {value,previous:e.lifecycle,next:String(input.state)};
 },actor);
}
export async function configureCommission(input:OperationInput,actor?:Principal){
 return operation<Record<string,unknown>>(input,'configuration.write',async(db,p,id)=>{
  if(input.action!=='commission.create')fail('Operación inválida.');
  const scope=text(input.scope,20);if(!['GLOBAL','ORGANIZER','EVENT'].includes(scope))fail('Alcance inválido.');
  const bps=integer(input.basisPoints,0,10000),fixed=integer(input.fixedClp,0,100000000),reference=text(input.policyReference);
  const effective=new Date(text(input.effectiveAt,40));if(!Number.isFinite(effective.getTime())||effective.getTime()<Date.now())fail('La vigencia debe ser futura.');
  const scopeId=scope==='GLOBAL'?null:text(input.scopeId,200);
  await db.query('INSERT INTO commission_versions(id,scope,organizer_id,event_id,basis_points,fixed_clp,effective_at,policy_reference,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,scope,scope==='ORGANIZER'?scopeId:null,scope==='EVENT'?scopeId:null,bps,fixed,effective,reference,p.id]);
  return {value:{id},next:'SCHEDULED'};
 },actor);
}
export async function supportOperation(input:OperationInput,actor?:Principal){
 return operation<Record<string,unknown>>(input,'support.write',async(db,p,id)=>{
  if(input.action==='support.create'){
   await db.query('INSERT INTO support_cases(id,subject,order_id,organizer_id,event_id,created_by) VALUES($1,$2,$3,$4,$5,$6)',[id,text(input.subject,160),input.orderId?text(input.orderId,200):null,input.organizerId?text(input.organizerId,200):null,input.eventId?text(input.eventId,200):null,p.id]);
   return {value:{id},next:'OPEN'};
  }
  const r=await db.query('SELECT status FROM support_cases WHERE id::text=$1 FOR UPDATE',[input.target]);if(!r.rowCount)fail('Caso no encontrado.');
  if(input.action==='support.note')await db.query('INSERT INTO support_notes(id,case_id,body,actor_id) VALUES($1,$2,$3,$4)',[randomUUID(),input.target,text(input.note,2000),p.id]);
  else if(input.action==='support.state'){
   if(!['OPEN','IN_PROGRESS','RESOLVED'].includes(String(input.state)))fail('Estado inválido.');
   await db.query('UPDATE support_cases SET status=$2,updated_at=now() WHERE id=$1',[input.target,input.state]);
  }else fail('Operación inválida.');
  return {value:{id:input.target},previous:r.rows[0].status,next:input.action==='support.state'?String(input.state):r.rows[0].status};
 },actor);
}
