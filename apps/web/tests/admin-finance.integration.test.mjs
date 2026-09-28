import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {localDatabase} from './local-postgres.mjs';
import {loadSource} from './load-source.mjs';
let db,identity,admin,superadmin,actor,owner,policy,operations,refunds,settlements,queries,checkout,finalizer;
let providerCalls=0,providerFailure=false,providerStatus='succeeded';
const saved=Object.fromEntries(['CHECKOUT_FEE_POLICY','STRIPE_REFUNDS_ENABLED'].map(k=>[k,process.env[k]]));
const provider={refunds:{create:async(body,opts)=>{providerCalls++;assert.equal(opts.idempotencyKey,`ticketchile-refund-${body.metadata.refundId}`);if(providerFailure)throw Error('Uncertain response');return {id:`re_${body.metadata.refundId}`,amount:body.amount,currency:'clp',payment_intent:body.payment_intent,metadata:body.metadata,status:providerStatus};},retrieve:async()=>{throw Error('Unexpected retrieve');}}};
const load=(file,extra={})=>loadSource(file,{'@/lib/db':db,'./adapters.server':{adapter:()=>{throw Error('No checkout provider calls');}},'@/lib/stripe.server':{stripe:provider},'@/auth':{authOptions:{}},'next-auth/next':{getServerSession:async()=>null},'@/lib/security/http.server':{cookieIdentity:async()=>actor},'./http.server':{cookieIdentity:async()=>actor},'@/lib/security/rate-limit.server':{limit:async()=>{}},...extra});
const input=(action,target,extra={})=>({action,target,reason:'Approved synthetic test decision',confirmation:`${action} ${target}`,requestKey:randomUUID(),...extra});
async function fixture({commission=true,provider='stripe'}={}){
 const event=`ev_${randomUUID()}`;
 await db.pool.query("INSERT INTO events(id,slug,title,city,venue,date_iso,description,is_published) VALUES($1,$1,'Finance fixture','Santiago','Venue',now()+interval '30 days','Synthetic isolated event',true)",[event]);
 await db.pool.query('INSERT INTO organizer_events(event_id,organizer_id) VALUES($1,$2)',[event,owner.id]);
 await db.pool.query("INSERT INTO ticket_types(event_id,id,name,price_clp,capacity,max_per_order) VALUES($1,'general','General',10000,20,10)",[event]);
 if(commission)await db.pool.query("INSERT INTO commission_versions(id,scope,event_id,basis_points,fixed_clp,effective_at,policy_reference,actor_id) VALUES($1,'EVENT',$2,500,100,now()-interval '1 second','Synthetic policy',$3)",[randomUUID(),event,superadmin.id]);
 const payment=await checkout.preparePayment('owner@finance.test',provider,{eventId:event,buyerName:'Synthetic Buyer',buyerEmail:'buyer@finance.test',items:[{ticketTypeId:'general',qty:2}]},randomUUID());
 await db.pool.query("UPDATE payments SET provider_ref=$2,status='PENDING' WHERE id=$1",[payment.id,`cs_${payment.id}`]);
 await finalizer.recordVerifiedPayment({provider,reference:`cs_${payment.id}`,paymentId:payment.id,holdId:payment.hold_id,amount:payment.amount_clp,currency:'CLP',status:'PAID',observationKey:randomUUID(),intent:`pi_${payment.id}`});
 const order=await finalizer.finalizePayment(payment.id);const tickets=(await db.pool.query('SELECT id FROM tickets WHERE order_id=$1 ORDER BY id',[order.orderId])).rows;
 return {event,payment,order:order.orderId,tickets};
}
async function requested(f){return (await refunds.refundOperation(input('refund.request',f.payment.id),superadmin)).result.id;}
async function approved(f){const id=await requested(f);await refunds.refundOperation(input('refund.approve',id,{policyReference:'Synthetic policy'}),superadmin);return id;}
before(async()=>{
 Object.assign(process.env,{CHECKOUT_FEE_POLICY:'none',STRIPE_REFUNDS_ENABLED:'true'});db=await localDatabase();identity=load('lib/security/identity.server.ts');
 for(const role of ['ADMIN','SUPERADMIN']){await db.pool.query("INSERT INTO admin_users(id,username,password_hash,role) VALUES($1,$1,'disabled',$2)",[role,role]);await db.pool.query("INSERT INTO identity_mfa(kind,principal_id,enabled) VALUES('ADMIN',$1,true)",[role]);}
 await db.pool.query("INSERT INTO organizer_users(id,username,password_hash,verified,approved) VALUES('finance-owner','finance-owner','disabled',true,true)");
 admin=await identity.principal('ADMIN','ADMIN');superadmin=await identity.principal('ADMIN','SUPERADMIN');owner=await identity.principal('ORGANIZER','finance-owner');actor=superadmin;
 policy=load('lib/admin/policy.server.ts');operations=load('lib/admin/operations.server.ts');refunds=load('lib/payments/refunds.server.ts');settlements=load('lib/admin/settlements.server.ts');queries=load('lib/admin/queries.server.ts');checkout=load('lib/payments/create.server.ts');finalizer=load('lib/payments/finalize.server.ts');
});
after(async()=>{await db?.pool.end();for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
test('admin capability matrix rejects forged role, buyer, organizer, stale version, disabled and missing MFA',async()=>{
 await policy.requireAdminCapability('operations.read',admin);await assert.rejects(policy.requireAdminCapability('refund.write',{...admin,role:'SUPERADMIN'}));await assert.rejects(policy.requireAdminCapability('finance.read',owner));await assert.rejects(policy.requireAdminCapability('operations.read',{...admin,kind:'BUYER'}));await assert.rejects(policy.requireAdminCapability('operations.read',{...admin,version:99}));
 await db.pool.query("UPDATE admin_users SET is_active=false WHERE id='ADMIN'");await assert.rejects(policy.requireAdminCapability('operations.read',admin));await db.pool.query("UPDATE admin_users SET is_active=true WHERE id='ADMIN'");
 await db.pool.query("UPDATE identity_mfa SET enabled=false WHERE principal_id='ADMIN'");await assert.rejects(policy.requireAdminCapability('operations.read',admin));await db.pool.query("UPDATE identity_mfa SET enabled=true WHERE principal_id='ADMIN'");
});
test('commission settings have no default, snapshot purchase policy, reject retroactive changes and remain immutable',async()=>{
 const no=await fixture({commission:false});assert.equal((await db.pool.query('SELECT commission_clp FROM payment_finance_snapshots WHERE payment_id=$1',[no.payment.id])).rows[0].commission_clp,null);
 await assert.rejects(settlements.settlementOperation(input('settlement.create',no.event),superadmin),e=>e.code==='MISSING_POLICY');
 const f=await fixture();assert.equal((await db.pool.query('SELECT commission_clp FROM payment_finance_snapshots WHERE payment_id=$1',[f.payment.id])).rows[0].commission_clp,1100);
 await assert.rejects(operations.configureCommission(input('commission.create','policy',{scope:'GLOBAL',basisPoints:200,fixedClp:0,effectiveAt:'2020-01-01T00:00:00Z',policyReference:'past'}),superadmin));
 await operations.configureCommission(input('commission.create','policy',{scope:'EVENT',scopeId:f.event,basisPoints:900,fixedClp:0,effectiveAt:new Date(Date.now()+60000).toISOString(),policyReference:'future'}),superadmin);
 assert.equal((await db.pool.query('SELECT commission_clp FROM payment_finance_snapshots WHERE payment_id=$1',[f.payment.id])).rows[0].commission_clp,1100);
 await assert.rejects(db.pool.query('UPDATE payment_finance_snapshots SET commission_clp=0 WHERE payment_id=$1',[f.payment.id]),/append-only/);
});
test('refund requests are durable, concurrent, full amount only and require confirmation/capability',async()=>{
 const f=await fixture(),body=input('refund.request',f.payment.id,{amount:1});
 await assert.rejects(refunds.refundOperation(body,admin));await assert.rejects(refunds.refundOperation({...body,confirmation:''},superadmin));
 const results=await Promise.all(Array.from({length:5},()=>refunds.refundOperation(body,superadmin)));assert.equal(new Set(results.map(r=>r.operationId)).size,1);
 const r=(await db.pool.query('SELECT * FROM refunds WHERE payment_id=$1',[f.payment.id])).rows[0];assert.equal(r.amount_clp,20000);
 await assert.rejects(refunds.refundOperation({...body,reason:'Changed payload'},superadmin),e=>e.code==='IDEMPOTENCY_CONFLICT');await assert.rejects(requested(f));
});
test('refund provider success cancels only mapped tickets, callbacks are monotonic and duplicate-safe',async()=>{
 const f=await fixture(),other=await fixture(),id=await approved(f),body=input('refund.execute',id),before=providerCalls;
 await Promise.all([refunds.refundOperation(body,superadmin),refunds.refundOperation(body,superadmin)]);assert.equal(providerCalls-before,1);
 assert.equal((await db.pool.query('SELECT status FROM refunds WHERE id=$1',[id])).rows[0].status,'COMPLETED');
 assert.ok((await db.pool.query('SELECT status FROM tickets WHERE order_id=$1',[f.order])).rows.every(t=>t.status==='CANCELLED'));
 assert.ok((await db.pool.query('SELECT status FROM tickets WHERE order_id=$1',[other.order])).rows.every(t=>t.status==='VALID'));
 await refunds.applyStripeRefund({id:`re_${id}`,amount:20000,currency:'clp',payment_intent:`pi_${f.payment.id}`,metadata:{refundId:id,paymentId:f.payment.id},status:'pending'},'WEBHOOK');
 assert.equal((await db.pool.query('SELECT status FROM refunds WHERE id=$1',[id])).rows[0].status,'COMPLETED');
 await assert.rejects(refunds.applyStripeRefund({id:`re_${id}`,amount:1,currency:'clp',payment_intent:`pi_${f.payment.id}`,metadata:{refundId:id,paymentId:f.payment.id},status:'succeeded'},'WEBHOOK'));
});
test('uncertain refund blocks scanner and cannot recreate after provider idempotency window',async()=>{
 const f=await fixture(),id=await approved(f);providerFailure=true;await assert.rejects(refunds.refundOperation(input('refund.execute',id),superadmin),e=>e.code==='REFUND_UNKNOWN');providerFailure=false;
 const scanner=load('app/api/scanner/checkin/route.ts',{'@/lib/security/http.server':{readBody:r=>r.json()},'@/lib/security/capabilities.server':{organizerActor:async()=>owner}});
 const response=await scanner.POST(new Request('https://local/api/scanner/checkin',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://local'},body:JSON.stringify({eventId:f.event,ticketId:f.tickets[0].id})}));assert.equal(response.status,409);
 await db.pool.query("UPDATE refunds SET first_attempt_at=now()-interval '25 hours' WHERE id=$1",[id]);const calls=providerCalls;
 await assert.rejects(refunds.refundOperation(input('refund.execute',id),superadmin),e=>e.code==='MANUAL_REVIEW');assert.equal(providerCalls,calls);
});
test('used tickets, unsupported provider and disabled execution fail without provider calls',async()=>{
 const f=await fixture();await db.pool.query("UPDATE tickets SET status='USED',used_at=now() WHERE id=$1",[f.tickets[0].id]);await assert.rejects(requested(f));
 const unsupported=await fixture({provider:'flow'}),id=await approved(unsupported),calls=providerCalls;await assert.rejects(refunds.refundOperation(input('refund.execute',id),superadmin));assert.equal(providerCalls,calls);
 process.env.STRIPE_REFUNDS_ENABLED='false';await assert.rejects(refunds.refundOperation(input('refund.execute',id),superadmin),e=>e.code==='PROVIDER_DISABLED');process.env.STRIPE_REFUNDS_ENABLED='true';
});
test('settlement concurrency, adjustments, approval, exact external payout and replay preserve one allocation',async()=>{
 const f=await fixture(),body=input('settlement.create',f.event),results=await Promise.all(Array.from({length:5},()=>settlements.settlementOperation(body,superadmin))),id=results[0].operationId;
 assert.equal(new Set(results.map(r=>r.operationId)).size,1);await assert.rejects(settlements.settlementOperation(input('settlement.create',f.event),superadmin));await assert.rejects(requested(f));
 await settlements.settlementOperation(input('settlement.adjust',id,{amount:-300}),superadmin);
 let row=(await db.pool.query('SELECT * FROM settlements WHERE id=$1',[id])).rows[0];assert.equal(Number(row.net_clp),18600);
 await assert.rejects(settlements.settlementOperation(input('settlement.approve',id,{policyReference:'review'}),superadmin));
 await settlements.settlementOperation(input('settlement.approve',id,{policyReference:'review',accountingReviewed:true}),superadmin);
 await assert.rejects(settlements.settlementOperation(input('settlement.adjust',id,{amount:100}),superadmin));
 await assert.rejects(settlements.settlementOperation(input('settlement.paid',id,{amount:1,reference:'external'}),superadmin));
 const paid=input('settlement.paid',id,{amount:18600,reference:randomUUID()});await Promise.all([settlements.settlementOperation(paid,superadmin),settlements.settlementOperation(paid,superadmin)]);
 row=(await db.pool.query('SELECT * FROM settlements WHERE id=$1',[id])).rows[0];assert.equal(row.status,'PAID');assert.equal((await db.pool.query('SELECT count(*)::int n FROM payout_records WHERE settlement_id=$1',[id])).rows[0].n,1);
 await assert.rejects(db.pool.query('DELETE FROM settlement_lines WHERE settlement_id=$1',[id]),/append-only/);
});
test('refund accounting preserves commission policy and cancelled drafts release claims without erasing lines',async()=>{
 const f=await fixture(),id=await approved(f);await refunds.refundOperation(input('refund.execute',id),superadmin);
 const draft=await settlements.settlementOperation(input('settlement.create',f.event),superadmin),sid=draft.operationId;
 const row=(await db.pool.query('SELECT * FROM settlements WHERE id=$1',[sid])).rows[0];assert.equal(Number(row.refunds_clp),20000);assert.equal(Number(row.net_clp),-1100);
 await assert.rejects(settlements.settlementOperation(input('settlement.approve',sid,{policyReference:'review',accountingReviewed:true}),superadmin));
 await settlements.settlementOperation(input('settlement.cancel',sid),superadmin);assert.equal((await db.pool.query('SELECT count(*)::int n FROM settlement_claims WHERE payment_id=$1',[f.payment.id])).rows[0].n,0);
 assert.equal((await db.pool.query('SELECT count(*)::int n FROM settlement_lines WHERE settlement_id=$1',[sid])).rows[0].n,1);
});
test('admin read services return bounded redacted lists, exact buyer lookup and auditable detail',async()=>{
 const f=await fixture();for(const section of ['organizers','events','payments','refunds','settlements','commissions','support','audit','reports']){const r=await queries.adminList(section,{},superadmin);assert.ok(r.rows.length<=50);assert.doesNotMatch(JSON.stringify(r),/password_hash|secret_cipher|recovery_hashes|checkout_url/);}
 assert.equal((await queries.adminList('orders',{},admin)).rows.length,0);assert.equal((await queries.adminList('orders',{q:'buyer@finance.test'},admin)).rows.some(r=>r.id===f.order),true);
 assert.equal((await queries.adminList('orders',{q:'buyer@'},admin)).rows.length,0);
 assert.equal((await queries.adminDetail('orders',f.order,admin)).row.buyer_email,'buyer@finance.test');await assert.rejects(queries.adminDetail('payments',f.payment.id,admin));
});
test('support cases and private notes persist with immutable audit, no external email',async()=>{
 const support=await operations.supportOperation(input('support.create','new',{subject:'Synthetic case'}),admin),id=support.operationId;
 await operations.supportOperation(input('support.note',id,{note:'Internal review only'}),admin);await operations.supportOperation(input('support.state',id,{state:'RESOLVED'}),admin);
 const detail=await queries.adminDetail('support',id,admin);assert.equal(detail.row.status,'RESOLVED');assert.equal(detail.related.notes[0].body,'Internal review only');
 await assert.rejects(db.pool.query('DELETE FROM support_notes WHERE case_id=$1',[id]),/append-only/);await assert.rejects(queries.adminDetail('support',id,owner));
});
test('organizer suspension invalidates live access and administrative pause cannot be bypassed',async()=>{
 const f=await fixture(),rev=(await db.pool.query('SELECT revision FROM events WHERE id=$1',[f.event])).rows[0].revision;
 await operations.moderate(input('event.moderate',f.event,{state:'PAUSED',revision:rev}),admin);
 const ownerEvents=load('lib/organizer/events.server.ts',{'@/lib/security/capabilities.server':{organizerActor:async()=>owner}});
 await assert.rejects(ownerEvents.transitionEvent(f.event,rev+1,'PUBLISHED','PUBLISHED'),e=>e.code==='MODERATION_REQUIRED');
 const v=owner.version;await operations.moderate(input('organizer.review',owner.id,{state:'SUSPENDED'}),admin);
 assert.equal((await db.pool.query("SELECT security_can_event('ORGANIZER',$1,$2,$3,'event.read') allowed",[owner.id,v,f.event])).rows[0].allowed,false);
 await operations.moderate(input('organizer.review',owner.id,{state:'APPROVED'}),admin);owner=await identity.principal('ORGANIZER',owner.id);
});
test('admin mutation route rejects anonymous, cross-origin and missing permission before writes',async()=>{
 const route=load('app/api/admin/operations/route.ts',{'@/lib/security/http.server':{cookieIdentity:async()=>actor,readBody:r=>r.json()}});
 const req=(origin='https://local')=>new Request('https://local/api/admin/operations',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(input('commission.create','policy'))});
 actor=null;assert.equal((await route.POST(req())).status,401);actor=superadmin;assert.equal((await route.POST(req('https://foreign'))).status,403);actor=admin;assert.equal((await route.POST(req())).status,403);actor=superadmin;
});
test('CSV export enforces explicit bounded dates, permission, event scope and formula escaping',async()=>{
 const f=await fixture(),route=load('app/api/admin/export/route.ts'),today=new Date().toISOString().slice(0,10);
 actor=superadmin;assert.equal((await route.GET(new Request('https://local/api/admin/export'))).status,400);
 await assert.rejects(queries.adminList('reports',{from:'2026-02-31'},superadmin));
 const response=await route.GET(new Request(`https://local/api/admin/export?from=${today}&to=${today}&event=${f.event}`));assert.equal(response.status,200);const csv=await response.text();assert.ok(csv.includes(f.payment.id));assert.ok(!csv.includes('buyer@finance.test'));
 assert.equal(route.csvCell('  =SUM(1,2)'),`"'=SUM(1,2)"`);assert.equal(route.csvCell('a"b'),`"a""b"`);
 actor=owner;assert.equal((await route.GET(new Request(`https://local/api/admin/export?from=${today}&to=${today}`))).status,403);actor=superadmin;
});
test('Stripe refund webhook requires verified signature and mode before applying bound evidence',async()=>{
 const f=await fixture(),id=await approved(f);providerStatus='pending';try{await refunds.refundOperation(input('refund.execute',id),superadmin);}finally{providerStatus='succeeded';}
 const previous=process.env.STRIPE_WEBHOOK_SECRET,previousKey=process.env.STRIPE_SECRET_KEY;process.env.STRIPE_WEBHOOK_SECRET='synthetic-only';process.env.STRIPE_SECRET_KEY='sk_test_synthetic';
 const route=load('app/api/payments/stripe/webhook/route.ts',{'@/lib/payments/adapters.server':{normalizeStripe:()=>{throw Error('Not checkout');}},'@/lib/payments/reconcile.server':{},'@/lib/stripe.server':{stripe:{webhooks:{constructEvent:(raw,signature)=>{if(signature!=='verified-local-signature')throw Error('Invalid');return JSON.parse(raw);}}}}});
 const event={id:'evt_refund',type:'refund.updated',livemode:false,data:{object:{id:`re_${id}`,amount:20000,currency:'clp',payment_intent:`pi_${f.payment.id}`,metadata:{refundId:id,paymentId:f.payment.id},status:'succeeded'}}};
 const req=(signature,body=event)=>new Request('https://local/api/payments/stripe/webhook',{method:'POST',headers:{'stripe-signature':signature},body:JSON.stringify(body)});
 try{assert.equal((await route.POST(req('forged'))).status,400);assert.equal((await route.POST(req('verified-local-signature',{...event,livemode:true}))).status,400);assert.equal((await db.pool.query('SELECT status FROM refunds WHERE id=$1',[id])).rows[0].status,'PROCESSING');assert.equal((await route.POST(req('verified-local-signature'))).status,200);assert.equal((await db.pool.query('SELECT status FROM refunds WHERE id=$1',[id])).rows[0].status,'COMPLETED');}
 finally{if(previous===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=previous;if(previousKey===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=previousKey;}
});
test('organizer settlement visibility requires explicit finance capability and event scope',async()=>{
 const f=await fixture();await settlements.settlementOperation(input('settlement.create',f.event),superadmin);
 const finance=load('lib/organizer/finance.server.ts',{'@/lib/security/capabilities.server':{organizerActor:async()=>actor}});
 actor=owner;assert.equal((await finance.eventSettlements(f.event)).length,1);
 const buyer=randomUUID();await db.pool.query('INSERT INTO usuarios(id,email,email_verified_at) VALUES($1,$2,now())',[buyer,`${buyer}@finance.test`]);
 await db.pool.query("INSERT INTO organizer_staff(id,organizer_id,buyer_id,role,capabilities,event_ids) VALUES($1,$2,$3,'ORGANIZER_FINANCE',ARRAY['finance.read'],ARRAY[$4])",[randomUUID(),owner.id,buyer,f.event]);actor=await identity.principal('BUYER',buyer);assert.equal((await finance.eventSettlements(f.event)).length,1);
 const other=await fixture();await assert.rejects(finance.eventSettlements(other.event));await db.pool.query("UPDATE organizer_staff SET revoked_at=now() WHERE buyer_id=$1",[buyer]);await assert.rejects(finance.eventSettlements(f.event));
 const newOwner=`org_${randomUUID()}`;await db.pool.query("INSERT INTO organizer_users(id,username,password_hash,verified,approved) VALUES($1,$1,'disabled',true,true)",[newOwner]);await db.pool.query('UPDATE organizer_events SET organizer_id=$2 WHERE event_id=$1',[f.event,newOwner]);actor=await identity.principal('ORGANIZER',newOwner);assert.equal((await finance.eventSettlements(f.event)).length,0,'reassigning an event must not expose the prior tenant settlement');actor=superadmin;
});
