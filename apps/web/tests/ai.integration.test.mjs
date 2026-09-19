import {before,after,afterEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {localDatabase} from './local-postgres.mjs';
import {loadSource} from './load-source.mjs';
let db,actor,owner,foreign,identity,events,ai,sim,context,model;
const names=['SECURITY_DATA_KEY','AI_PROVIDER','AI_TIMEOUT_MS','AI_PUBLIC_HOURLY_LIMIT','AI_FEATURES','AI_GLOBAL_HOURLY_LIMIT','AI_USER_HOURLY_LIMIT'],saved=Object.fromEntries(names.map(k=>[k,process.env[k]]));
const overrides=()=>({'@/lib/db':db,'./http.server':{cookieIdentity:async()=>actor?.kind==='ORGANIZER'?actor:null},'./current.server':{buyerPrincipal:async()=>actor?.kind==='BUYER'?actor:null}});
const load=file=>loadSource(file,overrides());
const req=()=>new Request('http://local/api/ai/simulator');
const prompt='Concierto "Evento por revisar" en Santiago para 100 personas. General $15.000';
async function draft(){actor=owner;return (await events.createEvent(owner.id)).id;}
async function buyer(role,eventIds){const id=randomUUID();await db.pool.query("INSERT INTO usuarios(id,email,email_verified_at) VALUES($1,$2,now())",[id,`${id}@m7.test`]);await db.pool.query('INSERT INTO organizer_staff(id,organizer_id,buyer_id,role,capabilities,event_ids) VALUES($1,$2,$3,$4,staff_role_capabilities($4),$5)',[randomUUID(),owner.id,id,role,eventIds]);return identity.principal('BUYER',id);}
before(async()=>{
 Object.assign(process.env,{SECURITY_DATA_KEY:Buffer.alloc(32,77).toString('base64'),AI_PROVIDER:'development',AI_TIMEOUT_MS:'100',AI_PUBLIC_HOURLY_LIMIT:'5',AI_GLOBAL_HOURLY_LIMIT:'200',AI_USER_HOURLY_LIMIT:'30'});delete process.env.AI_FEATURES;
 db=await localDatabase();identity=load('lib/security/identity.server.ts');for(const id of ['m7-owner','m7-foreign'])await db.pool.query("INSERT INTO organizer_users(id,username,display_name,password_hash,verified,approved) VALUES($1,$1,$1,'disabled',true,true)",[id]);owner=await identity.principal('ORGANIZER','m7-owner');foreign=await identity.principal('ORGANIZER','m7-foreign');actor=owner;events=load('lib/organizer/events.server.ts');ai=load('lib/ai/service.server.ts');sim=load('lib/ai/simulator.server.ts');context=load('lib/ai/context.server.ts');model=load('lib/organizer/model.ts');
});
afterEach(async()=>{actor=owner;await db.pool.query("DELETE FROM security_rate_limits WHERE bucket LIKE 'ai-%' OR bucket='event-create'");});
after(async()=>{await db?.pool.end();for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;});
test('organizer AI authenticates, isolates tenants/events and respects role capabilities',async()=>{
 const id=await draft(),other=await draft();actor=null;await assert.rejects(ai.proposeEvent(id,prompt),{status:401});actor=foreign;await assert.rejects(ai.proposeEvent(id,prompt),{status:404});actor=await buyer('ORGANIZER_MANAGER',[id]);assert.equal((await ai.proposeEvent(id,prompt)).source,'LOCAL_RULES');await assert.rejects(ai.proposeEvent(other,prompt),{status:404});await assert.rejects(ai.proposeEvent(id,prompt,'analytics'),{status:404});actor=await buyer('ORGANIZER_DOOR',[id]);await assert.rejects(ai.proposeEvent(id,prompt),{status:404});
});
test('proposal generation never mutates; selected fields need server confirmation; apply is atomic/audited/single-use',async()=>{
 const id=await draft(),proposal=await ai.proposeEvent(id,prompt);assert.equal((await events.readEvent(id)).revision,1);
 await assert.rejects(ai.resolveProposal(id,proposal.id,{capacity:100},false),{code:'AI_CONFIRMATION'});
 for(const patch of [{lifecycle:'PUBLISHED'},{lifecycle:'CANCELLED'},{bank_account:'secret'},{image:'https://example.com'}])await assert.rejects(ai.resolveProposal(id,proposal.id,patch,true));
 await ai.resolveProposal(id,proposal.id,{title:'Edited title',capacity:100,tiers:proposal.patch.tiers},true);const e=await events.readEvent(id);assert.equal(e.title,'Edited title');assert.equal(e.lifecycle,'DRAFT');assert.equal(e.tiers[0].active,false);assert.equal(e.tiers[0].price_clp,15000);assert.equal(e.revision,2);await assert.rejects(ai.resolveProposal(id,proposal.id,{title:'Replay'},true),{status:404});
 const logs=(await db.pool.query("SELECT metadata FROM security_audit WHERE event_id=$1 AND action='ai.applied'",[id])).rows;assert.equal(logs.length,1);assert.equal(logs[0].metadata.outcome,'SENSITIVE_CONFIRMED');assert.match(logs[0].metadata.fields,/tiers/);
});
test('rejection, stale revisions, invalid edited patches and revoked grants leave draft unchanged',async()=>{
 const id=await draft(),p=await ai.proposeEvent(id,prompt);await ai.resolveProposal(id,p.id,{},false,true);assert.equal((await events.readEvent(id)).revision,1);
 const p2=await ai.proposeEvent(id,prompt);await assert.rejects(ai.resolveProposal(id,p2.id,{capacity:-1},true));assert.equal((await events.readEvent(id)).revision,1);await events.saveEvent(id,1,{...model.emptyDraft,title:'New version'});await assert.rejects(ai.resolveProposal(id,p2.id,{title:'Stale'},false),{code:'REVISION_CONFLICT'});
 actor=await buyer('ORGANIZER_MANAGER',[id]);const p3=await ai.proposeEvent(id,prompt);await db.pool.query('UPDATE organizer_staff SET revoked_at=now() WHERE buyer_id=$1',[actor.id]);await assert.rejects(ai.resolveProposal(id,p3.id,{title:'Forbidden'},false),{status:404});
});
test('provider failures, timeout, invalid output and oversized input leave event unchanged and log sanitized metadata',async()=>{
 const id=await draft();const base={feature:'title',prompt,context:{title:'Existing'},facts:[],categories:[]};
 for(const [generate,code] of [[async()=>{throw new Error('secret-provider-content');},'AI_PROVIDER'],[()=>new Promise(()=>{}),'AI_TIMEOUT'],[async()=>({output:{publish:true}}),'AI_SCHEMA']]){
  const key=randomUUID();await assert.rejects(ai.generate({...base,requestId:key},`ORGANIZER:${owner.id}`,1,{actor:owner,eventId:id},{name:'test',model:'fake',generate}),{code});
  const row=(await db.pool.query('SELECT * FROM ai_requests WHERE id=$1',[key])).rows[0];assert.equal(row.state,'FAILED');assert.equal(row.outcome,code);assert.equal(row.result_ciphertext,null);assert.ok(!JSON.stringify(row).includes('secret-provider-content'));
 }
 await assert.rejects(ai.proposeEvent(id,'x'.repeat(4001)),{code:'AI_INPUT'});assert.equal((await events.readEvent(id)).revision,1);
});
test('request replay returns one validated result, concurrent duplicate cannot trigger repeated provider charges',async()=>{
 const id=await draft();const key=randomUUID(),p=await ai.proposeEvent(id,prompt,'event',key);assert.equal((await ai.proposeEvent(id,prompt,'event',key)).id,p.id);await assert.rejects(ai.proposeEvent(id,prompt+'changed','event',key),{status:409});actor=foreign;await assert.rejects(ai.proposeEvent(id,prompt,'event',key));actor=owner;
 let calls=0;const input={feature:'title',prompt,context:{},facts:[],categories:[],requestId:randomUUID()},provider={name:'test',model:'fake',generate:async()=>{calls++;await new Promise(r=>setTimeout(r,30));return {output:{patch:{title:'Title'},missing:[],warnings:[],inferences:[],recommendations:[],copy:''}};}};
 const results=await Promise.allSettled([ai.generate(input,'same',1,{actor:owner,eventId:id},provider),ai.generate(input,'same',1,{actor:owner,eventId:id},provider)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);
});
test('analytics uses real scoped aggregates, no attendee/payment secrets or invented metric facts',async()=>{
 const id=await draft();await db.pool.query("INSERT INTO ticket_types(id,event_id,name,price_clp,capacity,sold) VALUES('general',$1,'private attendee name must not appear',10000,100,7)",[id]);
 const ctx=await context.aiContext(id,'analytics',owner);assert.equal(ctx.facts.find(f=>f.key==='sold').value,7);assert.equal(ctx.facts.find(f=>f.key==='gross_clp').value,0);assert.ok(!JSON.stringify(ctx.context).includes('private attendee'));assert.deepEqual(Object.keys(ctx.context),['limitations']);
 actor=await buyer('ORGANIZER_FINANCE',[id]);const p=await ai.proposeEvent(id,prompt,'analytics');assert.equal(p.facts.find(f=>f.key==='sold').value,7);assert.equal(p.inferences.length,1);await ai.resolveProposal(id,p.id,{},false,true);await assert.rejects(ai.proposeEvent(id,prompt,'event'));
});
test('public session protects encrypted draft, persists edits and requires authenticated confirmed single-use claim',async()=>{
 actor=null;const token=await sim.startSession(req());const result=await sim.generateSimulator(req(),token,prompt,randomUUID());assert.equal(result.draft.title,'Evento por revisar');await sim.storeSimulator(token,{...result.draft,title:'Edited public draft'});
 await assert.rejects(sim.readSimulator(randomUUID()));await assert.rejects(sim.claimSimulator(token,owner.id,true),{status:401});actor=owner;await assert.rejects(sim.claimSimulator(token,owner.id,false),{code:'AI_CONFIRMATION'});const claims=await Promise.allSettled([sim.claimSimulator(token,owner.id,true),sim.claimSimulator(token,owner.id,true)]);assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);const id=claims.find(r=>r.status==='fulfilled').value.id;const e=await events.readEvent(id);assert.equal(e.title,'Edited public draft');assert.equal(e.lifecycle,'DRAFT');await assert.rejects(sim.readSimulator(token));await assert.rejects(sim.claimSimulator(token,owner.id,true));
 const row=(await db.pool.query('SELECT * FROM ai_simulator_sessions WHERE claimed_event_id=$1',[id])).rows[0];assert.equal(row.draft_ciphertext,null);assert.equal(row.bound_id,owner.id);
});
test('expired and cross-user public claims are denied; IDs and input organizer IDs do not grant scope',async()=>{
 actor=owner;const token=await sim.startSession(req());await sim.storeSimulator(token,{...model.emptyDraft,title:'Bound draft'});actor=foreign;await assert.rejects(sim.readSimulator(token),{status:403});await assert.rejects(sim.claimSimulator(token,foreign.id,true),{status:404});actor=owner;await assert.rejects(sim.claimSimulator(token,foreign.id,true));await db.pool.query("UPDATE ai_simulator_sessions SET expires_at=now()-interval '1 second' WHERE bound_id=$1",[owner.id]);await assert.rejects(sim.claimSimulator(token,owner.id,true),{status:404});
});
test('public rate limits apply to cookie subjects and trusted network fallback, not arbitrary client IP headers',async()=>{
 actor=null;const token=await sim.startSession(req());for(let i=0;i<5;i++)await sim.generateSimulator(req(),token,prompt,randomUUID());await assert.rejects(sim.generateSimulator(req(),token,prompt,randomUUID()),{status:429});
 const rate=load('lib/security/rate-limit.server.ts');assert.equal(rate.networkSubject(new Request('http://local',{headers:{'x-forwarded-for':'1.2.3.4'}})),'unattributed');
});
test('AI routes reject CSRF, oversized and anonymous organizer requests, and compatibility uses same provider',async()=>{
 const id=await draft(),route=load('app/api/organizer/events/[id]/ai/route.ts'),ctx={params:Promise.resolve({id})};const request=(origin,body)=>new Request('https://local/api/organizer/events/x/ai',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await route.POST(request('https://evil',{action:'generate',prompt}),ctx)).status,403);assert.equal((await route.POST(request('https://local',{prompt:'x'.repeat(66000)}),ctx)).status,413);actor=null;assert.equal((await route.POST(request('https://local',{action:'generate',feature:'event',requestId:randomUUID(),prompt}),ctx)).status,401);actor=owner;
 const alias=load('lib/organizer/operations.server.ts');assert.equal((await alias.organizerProposal(id,prompt)).source,'LOCAL_RULES');
});
test('public failed regeneration preserves saved edits and invalid claim rolls back event creation',async()=>{
 actor=null;const token=await sim.startSession(req());await sim.storeSimulator(token,{...model.emptyDraft,title:'Do not lose this'});
 await assert.rejects(sim.generateSimulator(req(),token,'x'.repeat(4001),randomUUID()),{code:'AI_INPUT'});assert.equal((await sim.readSimulator(token)).draft.draft.title,'Do not lose this');
 await sim.storeSimulator(token,{...model.emptyDraft,title:'Invalid category',category_slug:'invented'});actor=owner;const count=Number((await db.pool.query('SELECT count(*) FROM events')).rows[0].count);await assert.rejects(sim.claimSimulator(token,owner.id,true));assert.equal(Number((await db.pool.query('SELECT count(*) FROM events')).rows[0].count),count);assert.equal((await sim.readSimulator(token)).draft.draft.title,'Invalid category');
});
