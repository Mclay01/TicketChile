import 'server-only';
import {pool,withTx} from '@/lib/db';
import {organizerActor,requireOrganizerCapability} from '@/lib/security/capabilities.server';
import {digest,randomToken,seal,unseal} from '@/lib/security/crypto.server';
import {limit,networkSubject} from '@/lib/security/rate-limit.server';
import {audit} from '@/lib/security/audit.server';
import {createEventTx,saveEventTx,validateDraft} from '@/lib/organizer/events.server';
import {emptyDraft,type Draft} from '@/lib/organizer/model';
import {categories,fail,generate,requestId} from './service.server';
import {aiConfig} from './provider.server';
import type {Proposal} from './model';

export const simulatorCookie='tc_ai_draft';
const hash=(token:string)=>/^[a-f0-9]{64}$/.test(token)?digest(token):fail('AI_DRAFT_MISSING',404,'No hay borrador vigente en este navegador.');
export async function startSession(req:Request,token?:string){
 if(token){const row=(await pool.query('SELECT token_hash FROM ai_simulator_sessions WHERE token_hash=$1 AND expires_at>now() AND claimed_event_id IS NULL',[hash(token)])).rows[0];if(row)return token;}
 await limit('ai-session-network',networkSubject(req),{hits:20,seconds:3600});
 const fresh=randomToken();await pool.query('INSERT INTO ai_simulator_sessions(token_hash) VALUES($1)',[hash(fresh)]);return fresh;
}
async function optionalActor(){try{return await organizerActor();}catch{return null;}}
export async function readSimulator(token:string){
 const key=hash(token),row=(await pool.query('SELECT * FROM ai_simulator_sessions WHERE token_hash=$1 AND expires_at>now() AND claimed_event_id IS NULL',[key])).rows[0];
 if(!row)fail('AI_DRAFT_MISSING',404,'El borrador venció o ya fue reclamado.');
 if(row.bound_id){const actor=await optionalActor();if(!actor||row.bound_kind!==actor.kind||row.bound_id!==actor.id)fail('AI_DRAFT_BOUND',403,'Este borrador está vinculado a otra sesión de usuario.');}
 return {draft:row.draft_ciphertext?JSON.parse(unseal(row.draft_ciphertext,`simulator:${key}`)) as {draft:Draft;proposal:Proposal|null}:null,expiresAt:row.expires_at.toISOString()};
}
export async function generateSimulator(req:Request,token:string,prompt:unknown,key:unknown){
 await readSimulator(token);if(typeof prompt!=='string')fail();
 // Unlike login protection, public model calls have a tight shared fallback.
 // Client-supplied forwarded headers are never accepted unless ingress is configured.
 await limit('ai-public-network',networkSubject(req),{hits:aiConfig().publicRate*4,seconds:3600});
 const proposal=await generate({feature:'event',prompt,requestId:requestId(key),context:{},facts:[],categories:await categories()},`simulator:${hash(token)}`);
 const draft=validateDraft({...emptyDraft,...proposal.patch});
 await storeSimulator(token,draft,proposal);
 return {draft,proposal};
}
export async function storeSimulator(token:string,input:unknown,proposal?:Proposal){
 const current=await readSimulator(token),key=hash(token),draft=validateDraft(input);
 draft.tiers=draft.tiers.map(t=>({...t,active:false}));
 if([draft.image,draft.hero_desktop,draft.hero_mobile].some(Boolean))fail();
 // Browser cannot replace provenance. Only generateSimulator supplies a proposal.
 const saved={draft,proposal:proposal||current.draft?.proposal||null},actor=await optionalActor();
 const result=await pool.query(`UPDATE ai_simulator_sessions SET draft_ciphertext=$2,proposal_id=$3,
  bound_kind=COALESCE(bound_kind,$4),bound_id=COALESCE(bound_id,$5) WHERE token_hash=$1 AND expires_at>now() AND claimed_event_id IS NULL
  AND (bound_id IS NULL OR (bound_kind=$4 AND bound_id=$5)) RETURNING token_hash`,[key,seal(JSON.stringify(saved),`simulator:${key}`),saved.proposal?.id||null,actor?.kind||null,actor?.id||null]);
 if(!result.rowCount)fail('AI_DRAFT_MISSING',409,'El borrador ya no está disponible.');
 return saved;
}
export async function claimSimulator(token:string,organizerId:unknown,confirmed:unknown){
 if(typeof organizerId!=='string')fail();
 const actor=await requireOrganizerCapability(organizerId,'event.edit'),key=hash(token);
 if(confirmed!==true)fail('AI_CONFIRMATION',409,'Revisa y confirma los valores antes de crear el borrador de organizador.');
 await limit('event-create',`${actor.kind}:${actor.id}`,{hits:20,seconds:3600});
 return withTx(async client=>{
  const row=(await client.query(`SELECT * FROM ai_simulator_sessions WHERE token_hash=$1 AND expires_at>now() AND claimed_event_id IS NULL
   AND (bound_id IS NULL OR (bound_kind=$2 AND bound_id=$3)) FOR UPDATE`,[key,actor.kind,actor.id])).rows[0];
  if(!row?.draft_ciphertext)fail('AI_DRAFT_MISSING',404,'El borrador no está disponible para esta cuenta.');
  const saved=JSON.parse(unseal(row.draft_ciphertext,`simulator:${key}`)) as {draft:Draft;proposal:Proposal|null};
  const event=await createEventTx(client,organizerId,actor);
  await saveEventTx(client,actor,event.id,1,saved.draft,true);
  await client.query('UPDATE ai_simulator_sessions SET bound_kind=$2,bound_id=$3,claimed_event_id=$4,draft_ciphertext=NULL WHERE token_hash=$1',[key,actor.kind,actor.id,event.id]);
  await audit(client,{actor,organizerId,eventId:event.id,action:'ai.simulator_claimed',targetType:'ai_proposal',targetId:row.proposal_id||undefined,metadata:{provider:saved.proposal?.source||'manual',outcome:'SENSITIVE_CONFIRMED'}});
  return event;
 });
}
