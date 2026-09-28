import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {localDatabase} from '../tests/local-postgres.mjs';
import {loadSource} from '../tests/load-source.mjs';
const db=await localDatabase(),metrics=[];
Object.assign(process.env,{NODE_ENV:'test',APP_ENVIRONMENT:'development',VERCEL_ENV:'',SECURITY_DATA_KEY:Buffer.alloc(32,13).toString('base64'),CHECKOUT_FEE_POLICY:'none',PROMOTIONS_ENABLED:'true',TICKETCHILE_QR_SECRET:'m13-synthetic-load-key',FROM_EMAIL:'fixture@m13.test'});
let owner;
const load=(file,extra={})=>loadSource(file,{'@/lib/db':db,'@/auth':{},'next-auth/next':{getServerSession:async()=>null},'./http.server':{cookieIdentity:async()=>owner},'./current.server':{buyerPrincipal:async()=>null},'./adapters.server':{},'@/lib/mail/transport.server':{mailConfigured:()=>false,sendTransactionalMail:()=>assert.fail('External mail')},'@/lib/tickets.email':{buildTicketEmail:({to})=>({to,from:'fixture@m13.test',subject:'Synthetic',html:'Synthetic'})},...extra});
async function measure(name,count,concurrency,fn){
 const times=[],started=performance.now(),results=[];
 for(let i=0;i<count;i+=concurrency)await Promise.all(Array.from({length:Math.min(concurrency,count-i)},async(_,n)=>{const t=performance.now();results[i+n]=await fn(i+n);times.push(performance.now()-t);}));
 times.sort((a,b)=>a-b);metrics.push({operation:name,count,concurrency,totalMs:Math.round(performance.now()-started),p50Ms:Math.round(times[Math.floor(times.length*.5)]),p95Ms:Math.round(times[Math.min(times.length-1,Math.floor(times.length*.95))])});return results;
}
try{
 await db.pool.query(`INSERT INTO organizer_users(id,username,password_hash,verified,approved) VALUES('load-owner','load-owner','disabled',true,true);
 INSERT INTO admin_users(id,username,password_hash,role) VALUES('load-admin','load-admin','disabled','SUPERADMIN');
 INSERT INTO identity_mfa(kind,principal_id,enabled) VALUES('ADMIN','load-admin',true);
 INSERT INTO events(id,slug,title,city,venue,date_iso,description,is_published,capacity) VALUES('load-event','load-event','Synthetic bounded load','Santiago','Fixture',now()+interval '30 days','Synthetic',true,100);
 INSERT INTO organizer_events(event_id,organizer_id) VALUES('load-event','load-owner');
 INSERT INTO ticket_types(id,event_id,name,price_clp,capacity,max_per_order) VALUES('general','load-event','General',1000,100,4);`);
 const identities=load('lib/security/identity.server.ts');owner=await identities.principal('ORGANIZER','load-owner');const admin=await identities.principal('ADMIN','load-admin');
 const catalog=load('lib/events.server.ts'),checkout=load('lib/payments/create.server.ts'),finalize=load('lib/payments/finalize.server.ts');
 await measure('catalog',30,5,async()=>assert.equal((await catalog.catalogDb()).total,1));
 const promo=load('lib/operations/promotions.server.ts'),promotion=await promo.savePromotion('load-event',{code:'M13LOAD',kind:'PERCENT',value:10,usageLimit:10,tierIds:['general'],startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),confirmed:true});
 await promo.savePromotion('load-event',{id:promotion.id,action:'toggle',active:true,confirmed:true});
 const payments=await measure('hold + checkout preparation',20,5,i=>checkout.preparePayment(`buyer${i}@m13.test`,'stripe',{eventId:'load-event',buyerName:'Synthetic buyer',buyerEmail:`buyer${i}@m13.test`,items:[{ticketTypeId:'general',qty:1}],promotionCode:i<10?'M13LOAD':''},randomUUID()));
 await assert.rejects(checkout.preparePayment('overflow@m13.test','stripe',{eventId:'load-event',buyerName:'Synthetic',buyerEmail:'overflow@m13.test',items:[{ticketTypeId:'general',qty:1}],promotionCode:'M13LOAD'},randomUUID()),{code:'INVALID_PROMOTION'});
 await measure('verified fixture finalization',20,5,async i=>{const p=payments[i];await db.pool.query("UPDATE payments SET provider_ref=$1,creation_state='READY' WHERE id=$1",[p.id]);await finalize.recordVerifiedPayment({provider:'stripe',reference:p.id,paymentId:p.id,holdId:p.hold_id,amount:p.amount_clp,currency:'CLP',status:'PAID',observationKey:'fixture-'+p.id});await finalize.finalizePayment(p.id);});
 const tickets=(await db.pool.query('SELECT id FROM tickets ORDER BY id')).rows;
 const scanner=load('app/api/scanner/checkin/route.ts',{'@/lib/event-access.server':{requireEventAccess:async()=>({actor:owner,organizerId:owner.id})}});
 await measure('authorized check-in',20,5,async i=>assert.equal((await scanner.POST(new Request('https://fixture.test/api/scanner/checkin',{method:'POST',headers:{origin:'https://fixture.test','content-type':'application/json'},body:JSON.stringify({eventId:'load-event',ticketId:tickets[i].id})}))).status,200));
 const attendees=load('lib/operations/attendees.server.ts'),adminReads=load('lib/admin/queries.server.ts');
 await measure('authorized attendee list',20,5,async()=>assert.equal((await attendees.attendeeList('load-event')).rows.length,20));
 await measure('MFA admin payment list',20,5,async()=>{await adminReads.adminList('payments',{},admin);});
 const mail=load('lib/mail/jobs.server.ts'),messages=new Map();
 await measure('overlapping bounded mail batches',4,2,()=>mail.processMailJobs({limit:10,transport:async(message,key)=>{messages.set(key,message);}}));
 // Used tickets are deliberately cancelled before delivery, rather than sending stale admission credentials.
 assert.equal(messages.size,0);assert.equal((await db.pool.query("SELECT count(*)::int n FROM mail_jobs WHERE state='CANCELLED'")).rows[0].n,20);
 assert.deepEqual((await db.pool.query('SELECT sold,held FROM ticket_types')).rows[0],{sold:20,held:0});
 assert.equal((await db.pool.query('SELECT count(*)::int n FROM promotion_reservations')).rows[0].n,10);
 const report={at:new Date().toISOString(),database:db.database,metrics,externalProviderCalls:0,integrity:'20 issued/used tickets; held=0; promotion limit=10; no stale ticket mail',limitations:'Bounded small local fixtures, not production capacity or external-provider load certification'};
 await fs.mkdir('../../docs/03-implementation/qa/m13',{recursive:true});await fs.writeFile('../../docs/03-implementation/qa/m13/load-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await db.pool.end();}
