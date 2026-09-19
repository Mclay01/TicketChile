import 'server-only';
import {randomUUID} from 'node:crypto';
import {pool,withTx} from '@/lib/db';
import {AccessError} from '@/lib/access.server';
import {organizerActor} from '@/lib/security/capabilities.server';
import {privateDigest,seal,unseal} from '@/lib/security/crypto.server';
import {audit} from '@/lib/security/audit.server';
import {limit} from '@/lib/security/rate-limit.server';
import {readEvent,saveEventTx,validateDraft} from '@/lib/organizer/events.server';
import {emptyDraft,type Draft} from '@/lib/organizer/model';
import type {Principal} from '@/lib/security/identity.server';
import {aiContext,requiredCapability} from './context.server';
import {aiConfig,configuredProvider,type AIInput,type AIProvider} from './provider.server';
import {validateOutput} from './schema';
import {minimize} from './privacy';
import {allowedFields,criticalFields,features,type Feature,type Proposal} from './model';

export function fail(code='AI_INVALID',status=400,message='Propuesta inválida. Revisa los campos.'):never{throw new AccessError(status,code,message);}
export function featureValue(value:unknown):Feature {if(typeof value!=='string'||!features.includes(value as Feature))fail();return value as Feature;}
export function requestId(value:unknown):string {if(typeof value!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))fail();return value;}
export async function categories(){return (await pool.query('SELECT slug FROM event_categories ORDER BY slug')).rows.map(r=>String(r.slug));}
export async function generate(input:AIInput,subject:string,baseRevision=0,scope?:{actor:Principal;eventId:string},provider?:AIProvider):Promise<Proposal>{
 const c=aiConfig();requestId(input.requestId);
 if(typeof input.prompt!=='string'||input.prompt.trim().length<10||input.prompt.length>c.maxInput||JSON.stringify(input.context).length>20000)fail('AI_INPUT',400,`Escribe entre 10 y ${c.maxInput} caracteres, sin datos personales.`);
 if(!c.enabled.includes(input.feature))fail('AI_UNAVAILABLE',503,'Esta función de IA está deshabilitada. Puedes continuar manualmente.');
 const subjectHash=privateDigest(`ai:${subject}`),inputHash=privateDigest(JSON.stringify(input));
 const previous=(await pool.query('SELECT * FROM ai_requests WHERE id=$1',[input.requestId])).rows[0];
 if(previous){
  if(previous.subject_hash!==subjectHash||previous.input_hash!==inputHash||previous.expires_at<=new Date())fail('AI_REQUEST_CONFLICT',409,'Solicitud vencida o distinta. Inicia una nueva revisión.');
  if(previous.state==='SUCCEEDED'&&!previous.resolved_at)return JSON.parse(unseal(previous.result_ciphertext,`ai:${previous.id}`));
  fail('AI_REQUEST_FINISHED',409,'Esta solicitud ya fue procesada o está en curso. Reintenta explícitamente con una nueva solicitud.');
 }
 const adapter=provider||configuredProvider();
 try{await limit('ai-user',subject,{hits:scope?c.userRate:c.publicRate,seconds:3600});await limit('ai-global','all',{hits:c.globalRate,seconds:3600});}
 catch(error){console.info(JSON.stringify({requestId:input.requestId,feature:input.feature,outcome:'RATE_LIMITED'}));throw error;}
 const inserted=await pool.query(`INSERT INTO ai_requests(id,subject_hash,input_hash,event_id,actor_kind,actor_id,feature,provider,model,state)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'RUNNING') ON CONFLICT DO NOTHING RETURNING id`,[input.requestId,subjectHash,inputHash,scope?.eventId||null,scope?.actor.kind||null,scope?.actor.id||null,input.feature,adapter.name,adapter.model]);
 if(!inserted.rowCount)fail('AI_REQUEST_RUNNING',409,'La solicitud ya está en curso.');
 const started=Date.now(),controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const safeInput={...input,prompt:minimize(input.prompt) as string,context:minimize(input.context) as Record<string,unknown>};
  const response=await Promise.race([adapter.generate(safeInput,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('AI_TIMEOUT'));},c.timeout);})]);
  if(Buffer.byteLength(JSON.stringify(response.output))>65536)throw new Error('AI_SCHEMA');
  const output=validateOutput(response.output,input.feature,input.categories,input.facts);
  if(scope)await readEvent(scope.eventId,requiredCapability(input.feature),undefined,scope.actor);
  const proposal:Proposal={...output,id:input.requestId,source:adapter.name,model:adapter.model,feature:input.feature,baseRevision,facts:input.facts};
  await pool.query(`UPDATE ai_requests SET state='SUCCEEDED',outcome='VALIDATED',result_ciphertext=$2,latency_ms=$3,input_tokens=$4,output_tokens=$5 WHERE id=$1`,[proposal.id,seal(JSON.stringify(proposal),`ai:${proposal.id}`),Date.now()-started,response.inputTokens??null,response.outputTokens??null]);
  return proposal;
 }catch(error){
  const outcome=error instanceof Error&&['AI_SCHEMA','AI_TIMEOUT'].includes(error.message)?error.message:'AI_PROVIDER';
  await pool.query("UPDATE ai_requests SET state='FAILED',outcome=$2,latency_ms=$3 WHERE id=$1",[input.requestId,outcome,Date.now()-started]);
  throw new AccessError(503,outcome,'No pudimos validar la propuesta. Tu borrador sigue intacto. Puedes reintentar o editar manualmente.');
 }finally{if(timer)clearTimeout(timer);console.info(JSON.stringify({requestId:input.requestId,feature:input.feature,provider:adapter.name,model:adapter.model,latencyMs:Date.now()-started}));}
}
export async function proposeEvent(id:string,prompt:unknown,feature:unknown='event',key:unknown=randomUUID()){
 const actor=await organizerActor(),task=featureValue(feature),{event,context,facts}=await aiContext(id,task,actor);
 if(typeof prompt!=='string')fail();
 return generate({feature:task,prompt,context,facts,categories:await categories(),requestId:requestId(key)},`${actor.kind}:${actor.id}`,event.revision,{actor,eventId:id});
}
export function selectedDraft(old:Draft,proposal:Proposal,patch:unknown,confirmed:unknown):Draft {
 if(!patch||typeof patch!=='object'||Array.isArray(patch))fail();
 const values=patch as Record<string,unknown>,keys=Object.keys(values);
 if(!keys.length||keys.some(k=>!Object.hasOwn(proposal.patch,k)||!allowedFields[proposal.feature].includes(k)))fail();
 if(keys.some(k=>criticalFields.includes(k))&&confirmed!==true)fail('AI_CONFIRMATION',409,'Confirma explícitamente fechas, ubicación, edad, precios y capacidades seleccionados.');
 const draft=Object.fromEntries(Object.keys(emptyDraft).map(k=>[k,old[k as keyof Draft]])) as Draft;
 for(const [k,v] of Object.entries(values)){
  if(k==='tiers'){
   if(!Array.isArray(v)||v.length>12)fail();
   draft.tiers=[...old.tiers,...v.map(t=>({...t,id:`ai_${randomUUID()}`,active:false,visible:true}))];
  }else Object.assign(draft,{[k]:v});
 }
 return validateDraft(draft);
}
export async function resolveProposal(id:string,key:unknown,patch:unknown,confirmed:unknown,reject=false){
 const actor=await organizerActor(),proposalId=requestId(key);
 await readEvent(id,undefined,undefined,actor);
 return withTx(async client=>{
  const row=(await client.query(`SELECT * FROM ai_requests WHERE id=$1 AND event_id=$2 AND actor_kind=$3 AND actor_id=$4
   AND state='SUCCEEDED' AND resolved_at IS NULL AND expires_at>now() FOR UPDATE`,[proposalId,id,actor.kind,actor.id])).rows[0];
  if(!row)fail('AI_NOT_FOUND',404,'Propuesta no disponible.');
  const proposal=JSON.parse(unseal(row.result_ciphertext,`ai:${proposalId}`)) as Proposal;
  const old=await readEvent(id,reject?requiredCapability(proposal.feature):'event.edit',undefined,actor);
  const result=reject?{revision:old.revision}:await saveEventTx(client,actor,id,proposal.baseRevision,selectedDraft(old,proposal,patch,confirmed),confirmed===true);
  await client.query('UPDATE ai_requests SET resolved_at=now() WHERE id=$1',[proposalId]);
  await audit(client,{actor,organizerId:old.organizer_id,eventId:id,action:reject?'ai.rejected':'ai.applied',targetType:'ai_proposal',targetId:proposalId,metadata:{provider:proposal.source,model:proposal.model,fields:reject?'':Object.keys(patch as object).join(','),outcome:confirmed===true?'SENSITIVE_CONFIRMED':'REVIEWED'}});
  return result;
 });
}
