import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {loadSource} from './load-source.mjs';
import {localDatabase} from './local-postgres.mjs';
let db,create,finalize,inventory,adapters,reconcile,mail,transport,crypto;
let currentEmail='owner@test.invalid',providerCalls=0,creationCalls=0,commitCalls=0,statusCalls=0;
let stripeResult,flowResult,webpayResult,createFailure=false,commitFailure=false;
const envKeys=['APP_BASE_URL','CHECKOUT_FEE_POLICY','STRIPE_ENABLED','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','SECURITY_DATA_KEY','FROM_EMAIL','WEBPAY_ENV','WEBPAY_COMMERCE_CODE','WEBPAY_API_KEY','WEBPAY_ENABLED','FLOW_ENABLED','FLOW_API_KEY','FLOW_SECRET_KEY','FLOW_BASE_URL','MAIL_TRANSPORT'];
const saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
const stripeMock={checkout:{sessions:{
 create:async(args,options)=>{creationCalls++;assert.match(options.idempotencyKey,/^payment-create:/);assert.equal(args.metadata.paymentId,args.client_reference_id);if(createFailure)throw new Error('provider secret');return {id:'cs_'+args.client_reference_id,url:'https://checkout.stripe.com/'+args.client_reference_id};},
 retrieve:async()=>{providerCalls++;return stripeResult;},
}},webhooks:{constructEvent:(raw,signature)=>{if(signature!=='valid-signature')throw new Error('secret');return JSON.parse(raw);}}};
const overrides=()=>({
 '@/lib/db':db,'@/lib/stripe.server':{stripe:stripeMock},'@/lib/flow':{flowGetStatus:async()=>{providerCalls++;return flowResult;}},
 'transbank-sdk':{Options:class{},Environment:{Integration:'integration',Production:'production'},WebpayPlus:{Transaction:class{
  async create(){creationCalls++;if(createFailure)throw new Error('uncertain');return {token:randomUUID(),url:'https://webpay3g.transbank.cl/pay'};}
  async commit(){commitCalls++;if(commitFailure)throw new Error('already committed');return webpayResult;}
  async status(){statusCalls++;return webpayResult;}
 }}},
 '@/lib/buyer-guard.server':{getBuyerEmail:async()=>currentEmail,TICKET_OWNER_SQL:"lower(coalesce(nullif(btrim(t.owner_email),''),nullif(btrim(o.owner_email),''),t.buyer_email))"},
 '@/lib/security/rate-limit.server':{limit:async()=>{},publicLimit:async()=>{}},
});
function load(entry,extra={}) {return loadSource(entry,{...overrides(),...extra});}
async function fixture({provider='stripe',qty=2,capacity=10}={}) {
 const event='event_'+randomUUID(),owner=randomUUID()+'@test.invalid';
 await db.pool.query("INSERT INTO events(id,slug,title,city,venue,date_iso,description,is_published) VALUES($1,$1,'Fixture','City','Venue',NOW(),'Local fixture',true)",[event]);
 await db.pool.query("INSERT INTO ticket_types(event_id,id,name,price_clp,capacity) VALUES($1,'general','General',1000,$2)",[event,capacity]);
 const body={eventId:event,items:[{ticketTypeId:'general',qty}],buyerName:'Fixture',buyerEmail:'contact@test.invalid'};
 const payment=await create.preparePayment(owner,provider,body,randomUUID());
 const ref=provider==='stripe'?'cs_'+payment.id:'token_'+payment.id;
 await db.pool.query("UPDATE payments SET provider_ref=$2,status='PENDING',creation_state='READY' WHERE id=$1",[payment.id,ref]);
 return {event,owner,body,p:await paymentRow(payment.id)};
}
async function paymentRow(id) {return (await db.pool.query('SELECT * FROM payments WHERE id=$1',[id])).rows[0];}
function evidence(p,changes={}) {return {provider:p.provider,reference:p.provider_ref,paymentId:p.id,holdId:p.hold_id,amount:p.amount_clp,currency:'CLP',status:'PAID',observationKey:randomUUID(),...changes};}
function session(p,changes={}) {return {id:p.provider_ref,client_reference_id:p.id,metadata:{paymentId:p.id,holdId:p.hold_id},mode:'payment',amount_total:p.amount_clp,currency:'clp',livemode:false,payment_status:'paid',status:'complete',payment_intent:'pi_'+p.id,...changes};}
async function counts(p) {
 return (await db.pool.query(`SELECT (SELECT count(*)::int FROM orders WHERE hold_id=$1) AS orders,
  (SELECT count(*)::int FROM tickets WHERE order_id=(SELECT id FROM orders WHERE hold_id=$1)) AS tickets,
  (SELECT held FROM ticket_types WHERE event_id=$2) AS held,(SELECT sold FROM ticket_types WHERE event_id=$2) AS sold`,[p.hold_id,p.event_id])).rows[0];
}
before(async()=>{
 Object.assign(process.env,{APP_BASE_URL:'https://ticketchile.test',CHECKOUT_FEE_POLICY:'none',STRIPE_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',SECURITY_DATA_KEY:Buffer.alloc(32,28).toString('base64'),FROM_EMAIL:'fixture@test.invalid',WEBPAY_ENV:'integration',WEBPAY_COMMERCE_CODE:'fixture',WEBPAY_API_KEY:'fixture',WEBPAY_ENABLED:'true',FLOW_ENABLED:'true',FLOW_API_KEY:'fixture',FLOW_SECRET_KEY:'fixture',FLOW_BASE_URL:'https://sandbox.flow.cl/api',MAIL_TRANSPORT:'disabled'});
 db=await localDatabase();
 create=load('lib/payments/create.server.ts');finalize=load('lib/payments/finalize.server.ts');inventory=load('lib/payments/inventory.server.ts');adapters=load('lib/payments/adapters.server.ts');reconcile=load('lib/payments/reconcile.server.ts');
 transport=load('lib/mail/transport.server.ts',{resend:{Resend:class{constructor(){assert.fail('Real mail forbidden');}}}});
 const templates=load('lib/tickets.email.ts',{'@/lib/mail/transport.server':transport});
 mail=load('lib/mail/jobs.server.ts',{'@/lib/tickets.email':templates,'@/lib/mail/transport.server':transport,'@/lib/qr-render.server':{renderTicketQr:async()=>Buffer.from('signed-local-qr')}});
 crypto=load('lib/security/crypto.server.ts');
});
after(async()=>{await db?.pool.end();for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});

test('server prices, duplicate item aggregation, contact versus owner and no invented fees',async()=>{
 const {p,owner}=await fixture();assert.equal(p.amount_clp,2000);assert.equal(p.fee_clp,0);assert.equal(p.owner_email,owner);assert.equal(p.buyer_email,'contact@test.invalid');
 const {body}=await fixture();body.items=[{ticketTypeId:'general',qty:1},{ticketTypeId:'general',qty:2}];
 const created=await create.preparePayment(randomUUID()+'@test.invalid','stripe',{...body,ownerEmail:'attacker@test.invalid',amount:3000},randomUUID());
 assert.equal(created.amount_clp,3000);assert.notEqual(created.owner_email,'attacker@test.invalid');
 await assert.rejects(create.preparePayment(randomUUID()+'@test.invalid','stripe',{...body,amount:1},randomUUID()),e=>e.code==='AMOUNT_CHANGED');
});
for(const qty of [0,-1,1.5,11,'2',null]) test(`checkout rejects invalid quantity ${qty}`,async()=>{
 const {body}=await fixture();await assert.rejects(create.preparePayment(randomUUID()+'@test.invalid','stripe',{...body,items:[{ticketTypeId:'general',qty}]},randomUUID()));
});
test('unpublished event and unknown type cannot reserve inventory',async()=>{
 const {body,event}=await fixture();await db.pool.query('UPDATE events SET is_published=false WHERE id=$1',[event]);
 await assert.rejects(create.preparePayment(randomUUID()+'@test.invalid','stripe',body,randomUUID()));
 await db.pool.query('UPDATE events SET is_published=true WHERE id=$1',[event]);
 await assert.rejects(create.preparePayment(randomUUID()+'@test.invalid','stripe',{...body,items:[{ticketTypeId:'foreign',qty:1}]},randomUUID()));
});
test('concurrent create retries yield one durable payment and hold',async()=>{
 const {body}=await fixture();const owner=randomUUID()+'@test.invalid',key=randomUUID();
 const results=await Promise.all(Array.from({length:8},()=>create.preparePayment(owner,'stripe',body,key)));
 assert.equal(new Set(results.map(p=>p.id)).size,1);assert.equal((await db.pool.query('SELECT count(*)::int n FROM holds WHERE owner_email=$1',[owner])).rows[0].n,1);
 await assert.rejects(create.preparePayment(owner,'stripe',{...body,buyerName:'Changed'},key),e=>e.code==='RETRY_CONFLICT');
});
test('existing hold cannot be claimed by another buyer or switched to another provider',async()=>{
 const {p,owner,body}=await fixture();
 await assert.rejects(create.preparePayment('attacker@test.invalid','stripe',{...body,holdId:p.hold_id},''),e=>e.status===404);
 await assert.rejects(create.preparePayment(owner,'flow',{...body,holdId:p.hold_id},''),e=>e.status===409);
 const same=await create.preparePayment(owner,'stripe',{...body,holdId:p.hold_id},'');assert.equal(same.id,p.id);
});
test('expired hold cannot create or resume payment and cleanup releases exactly once',async()=>{
 const {p,owner,body}=await fixture();await db.pool.query("UPDATE holds SET expires_at=NOW()-interval '1 second' WHERE id=$1",[p.hold_id]);
 await assert.rejects(create.startPayment(p),e=>e.code==='HOLD_EXPIRED');
 await Promise.all([db.withTx(inventory.expireHoldsTx),db.withTx(inventory.expireHoldsTx)]);
 assert.equal((await counts(p)).held,0);
 // A retry retrieves its own persisted attempt but start refuses expired inventory.
 const retry=await create.preparePayment(owner,'stripe',{...body,holdId:p.hold_id},'');await assert.rejects(create.startPayment(retry),e=>e.status===409);
});
test('concurrent different buyers cannot oversell last ticket',async()=>{
 const {event}=await fixture({qty:1,capacity:2});
 const attempts=await Promise.allSettled(Array.from({length:6},()=>create.preparePayment(randomUUID()+'@test.invalid','stripe',{eventId:event,items:[{ticketTypeId:'general',qty:1}],buyerName:'Fixture',buyerEmail:'contact@test.invalid'},randomUUID())));
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await db.pool.query('SELECT held FROM ticket_types WHERE event_id=$1',[event])).rows[0].held,2);
});
for(const [field,value] of [['amount',1],['currency','USD'],['holdId','foreign'],['reference','foreign'],['provider','flow']]) test(`verified evidence rejects wrong ${field}`,async()=>{
 const {p}=await fixture();await assert.rejects(finalize.recordVerifiedPayment(evidence(p,{[field]:value})),e=>e.code==='PAYMENT_MISMATCH');
 assert.equal((await paymentRow(p.id)).status,'PENDING');assert.equal((await counts(p)).tickets,0);
});
test('manual transfers and unverified PAID rows cannot issue tickets',async()=>{
 const {p}=await fixture({provider:'transfer'});assert.equal(p.status,'PENDING');await assert.rejects(finalize.recordVerifiedPayment(evidence(p)),e=>e.status===409);
 await db.pool.query("UPDATE payments SET status='PAID' WHERE id=$1",[p.id]);await assert.rejects(finalize.finalizePayment(p.id),e=>e.code==='UNVERIFIED_PAYMENT');
 assert.equal((await counts(p)).tickets,0);
});
test('simultaneous callbacks, webhook replay and status finalization issue exactly once',async()=>{
 const {p}=await fixture();const proof=evidence(p);
 await Promise.all(Array.from({length:8},()=>reconcile.applyVerifiedPayment(proof)));
 await Promise.all(Array.from({length:6},()=>finalize.finalizePayment(p.id)));
 assert.deepEqual(await counts(p),{orders:1,tickets:2,held:0,sold:2});
 const jobs=await db.pool.query('SELECT count(*)::int n FROM mail_jobs WHERE source_id IN (SELECT id FROM tickets WHERE order_id=$1)',[(await paymentRow(p.id)).order_id]);assert.equal(jobs.rows[0].n,2);
 const ticket=(await db.pool.query('SELECT * FROM tickets WHERE order_id=$1',[(await paymentRow(p.id)).order_id])).rows[0];
 await assert.rejects(db.pool.query(`INSERT INTO tickets(id,order_id,event_id,ticket_type_id,ticket_type_name,buyer_email,owner_email,status,issuance_index) VALUES($1,$2,$3,$4,$5,$6,$7,'VALID',$8)`,[randomUUID(),ticket.order_id,ticket.event_id,ticket.ticket_type_id,ticket.ticket_type_name,ticket.buyer_email,ticket.owner_email,ticket.issuance_index]),e=>e.code==='23505');
});
test('paid evidence survives a rolled-back issuance failure and recovers',async()=>{
 const {p}=await fixture();await finalize.recordVerifiedPayment(evidence(p));
 await db.pool.query(`CREATE FUNCTION test_fail_ticket() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER test_fail_ticket BEFORE INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION test_fail_ticket()`);
 try {await assert.rejects(finalize.finalizePayment(p.id));} finally {await db.pool.query('DROP TRIGGER test_fail_ticket ON tickets; DROP FUNCTION test_fail_ticket()');}
 assert.equal((await paymentRow(p.id)).status,'PAID');assert.deepEqual(await counts(p),{orders:0,tickets:0,held:2,sold:0});
 await finalize.finalizePayment(p.id);assert.deepEqual(await counts(p),{orders:1,tickets:2,held:0,sold:2});
});
test('late-paid expired reservation enters review without overselling or refund assumptions',async()=>{
 const {p}=await fixture();await db.pool.query("UPDATE holds SET expires_at=NOW()-interval '1 second' WHERE id=$1",[p.hold_id]);
 await db.withTx(inventory.expireHoldsTx);await reconcile.applyVerifiedPayment(evidence(p));
 assert.equal((await paymentRow(p.id)).status,'PAID');assert.equal((await paymentRow(p.id)).fulfillment_status,'REVIEW');assert.deepEqual(await counts(p),{orders:0,tickets:0,held:0,sold:0});
});
test('expiry versus finalization race preserves nonnegative inventory and one outcome',async()=>{
 const {p}=await fixture();await finalize.recordVerifiedPayment(evidence(p));
 await Promise.all([finalize.finalizePayment(p.id),db.withTx(inventory.expireHoldsTx)]);
 assert.deepEqual(await counts(p),{orders:1,tickets:2,held:0,sold:2});
});
test('cancellation replay releases once; delayed pending cannot revive cancelled; PAID cannot downgrade',async()=>{
 const {p}=await fixture();const cancelled=evidence(p,{status:'CANCELLED'});
 await finalize.recordVerifiedPayment(cancelled);await finalize.recordVerifiedPayment(cancelled);await finalize.recordVerifiedPayment(evidence(p,{status:'PENDING'}));
 assert.equal((await paymentRow(p.id)).status,'CANCELLED');assert.equal((await counts(p)).held,0);
 await finalize.recordVerifiedPayment(evidence(p));await finalize.recordVerifiedPayment(evidence(p,{status:'FAILED'}));assert.equal((await paymentRow(p.id)).status,'PAID');
});
for(const [key,value] of [['id','foreign'],['amount_total',1],['currency','usd'],['client_reference_id','foreign'],['metadata',{}],['mode','setup'],['livemode',true],['payment_intent',null]]) test(`Stripe independently rejects ${key} mismatch`,async()=>{
 const {p}=await fixture();assert.throws(()=>adapters.normalizeStripe(p,session(p,{[key]:value})),e=>e.status===409);
});
test('Stripe missing paid status does not issue; confirmed intent is durable',async()=>{
 const {p}=await fixture();const unpaid=adapters.normalizeStripe(p,session(p,{payment_status:undefined}));assert.equal(unpaid.status,'PENDING');
 await reconcile.applyVerifiedPayment(adapters.normalizeStripe(p,session(p)));assert.equal((await paymentRow(p.id)).provider_intent,'pi_'+p.id);
 assert.throws(()=>adapters.normalizeStripe({...p,provider_intent:'pi_other'},session(p)),e=>e.status===409);
});
test('Stripe raw webhook signature, replay, missing mapping and tampered amounts',async()=>{
 const {p}=await fixture();const route=load('app/api/payments/stripe/webhook/route.ts');
 const call=(signature,payload)=>route.POST(new Request('https://ticketchile.test/api/payments/stripe/webhook',{method:'POST',headers:{'stripe-signature':signature},body:JSON.stringify(payload)}));
 const event={id:'evt_'+randomUUID(),type:'checkout.session.completed',data:{object:session(p)}};
 assert.equal((await call('bad',event)).status,400);assert.equal((await counts(p)).tickets,0);
 assert.equal((await call('valid-signature',{...event,data:{object:session(p,{amount_total:1})}})).status,409);
 assert.equal((await call('valid-signature',{...event,data:{object:session(p,{id:'unmapped'})}})).status,503);
 assert.equal((await call('valid-signature',event)).status,200);assert.equal((await call('valid-signature',event)).status,200);assert.equal((await counts(p)).tickets,2);
});
test('Stripe creation is persisted before I/O and uncertain create reuses stable request',async()=>{
 const {body}=await fixture();const p=await create.preparePayment(randomUUID()+'@test.invalid','stripe',body,randomUUID());
 createFailure=true;try {await assert.rejects(create.startPayment(p),e=>e.code==='PAYMENT_RECOVERY_REQUIRED');}finally{createFailure=false;}
 assert.equal((await paymentRow(p.id)).creation_state,'UNKNOWN');
 await db.pool.query("UPDATE payments SET updated_at=NOW()-interval '3 minutes' WHERE id=$1",[p.id]);
 const recovered=await create.startPayment(await paymentRow(p.id));assert.equal(recovered.provider_ref,'cs_'+p.id);
 const expiry=(await db.pool.query('SELECT expires_at FROM holds WHERE id=$1',[p.hold_id])).rows[0].expires_at;
 assert.equal(new Date(expiry).getTime()-new Date(recovered.creation_started_at).getTime(),35*60000);
 const previous=creationCalls;await create.startPayment(recovered);assert.equal(creationCalls,previous);
});
test('Webpay uncertain creation is not blindly retried',async()=>{
 const {body}=await fixture();const p=await create.preparePayment(randomUUID()+'@test.invalid','webpay',body,randomUUID());
 createFailure=true;try {await assert.rejects(create.startPayment(p));}finally{createFailure=false;}
 const previous=creationCalls;await assert.rejects(create.startPayment(await paymentRow(p.id)));assert.equal(creationCalls,previous);
});
for(const field of ['buy_order','session_id','amount']) test(`Webpay rejects wrong ${field}`,async()=>{
 const {p}=await fixture({provider:'webpay'});const response={buy_order:p.id,session_id:p.hold_id,amount:p.amount_clp,status:'AUTHORIZED',response_code:0,[field]:field==='amount'?1:'foreign'};
 assert.throws(()=>adapters.normalizeWebpay(p,response),e=>e.status===409);assert.equal((await counts(p)).tickets,0);
});
test('Webpay duplicate/uncertain commit recovers authenticated status; browser cancellation never mutates',async()=>{
 const {p}=await fixture({provider:'webpay'});webpayResult={buy_order:p.id,session_id:p.hold_id,amount:p.amount_clp,status:'AUTHORIZED',response_code:0};commitFailure=true;
 try {await reconcile.reconcilePayment(p,true);}finally{commitFailure=false;}
 assert.ok(statusCalls>0);const previous=commitCalls;await reconcile.reconcilePayment(await paymentRow(p.id),true);assert.equal(commitCalls,previous);assert.equal((await counts(p)).tickets,2);
 const route=load('app/api/payments/webpay/return/route.ts');const response=await route.POST(new Request('https://attacker.test/api/payments/webpay/return',{method:'POST',body:new URLSearchParams({TBK_TOKEN:'unknown',TBK_ORDEN_COMPRA:p.id})}));
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),'https://ticketchile.test/?canceled=1');assert.equal(commitCalls,previous);
});
for(const [field,value] of [['commerceOrder','foreign'],['amount',1],['currency','USD'],['status',99],['flowOrder',0]]) test(`Flow rejects wrong ${field}`,async()=>{
 const {p}=await fixture({provider:'flow'});assert.throws(()=>adapters.normalizeFlow(p,{commerceOrder:p.id,amount:p.amount_clp,currency:'CLP',status:2,flowOrder:123,[field]:value}),e=>e.status===409);
});
test('Flow buyer token substitution and foreign payment reads deny before provider calls',async()=>{
 const {p}=await fixture({provider:'flow'});const service=load('lib/flow-reconcile.server.ts');const previous=providerCalls;
 await assert.rejects(service.reconcileFlow(p.provider_ref,{email:'attacker@test.invalid',paymentId:p.id}),e=>e.status===404);
 await assert.rejects(service.reconcileFlow('foreign',{email:p.owner_email,paymentId:p.id}),e=>e.status===404);assert.equal(providerCalls,previous);
 flowResult={commerceOrder:p.id,amount:p.amount_clp,currency:'CLP',status:2,flowOrder:Math.floor(Math.random()*10000000)+1};
 await service.reconcileFlow(p.provider_ref,{email:p.owner_email,paymentId:p.id});assert.equal((await counts(p)).tickets,2);
});
test('buyer status cannot recover transferred tickets or use another payment ID',async()=>{
 const {p}=await fixture();await reconcile.applyVerifiedPayment(evidence(p));const service=load('lib/payment-status.server.ts');
 await assert.rejects(service.buyerPaymentStatus('attacker@test.invalid',{id:p.id},true),e=>e.status===404);
 const order=(await paymentRow(p.id)).order_id;await db.pool.query("UPDATE tickets SET owner_email='new-owner@test.invalid' WHERE order_id=$1",[order]);
 const result=await service.buyerPaymentStatus(p.owner_email,{id:p.id});assert.equal(result.tickets.length,0);
});
test('availability is server gated; unsupported Fintoc and manual transfer cannot mutate',async()=>{
 const config=load('lib/payments/config.server.ts');assert.equal(config.availability('stripe').available,true);
 delete process.env.STRIPE_WEBHOOK_SECRET;assert.equal(config.availability('stripe').available,false);process.env.STRIPE_WEBHOOK_SECRET='whsec_fixture';
 delete process.env.CHECKOUT_FEE_POLICY;assert.equal(config.availability('flow').available,false);process.env.CHECKOUT_FEE_POLICY='none';
 assert.equal(config.availability('fintoc').available,false);assert.equal(config.availability('transfer').available,false);
 for(const endpoint of ['create','webhook']) {const route=load(`app/api/payments/fintoc/${endpoint}/route.ts`);assert.equal((await route.POST()).status,410);}
 const route=load('app/api/payments/transfer/create/route.ts');assert.equal((await route.POST(new Request('https://ticketchile.test/api/payments/transfer/create',{method:'POST',body:'{}'}))).status,503);
});
test('email failure leaves purchase issued, retries dedupe, and polling never dispatches',async()=>{
 // Isolate delivery jobs from previous payment scenarios.
 await db.pool.query("UPDATE mail_jobs SET state='CANCELLED' WHERE state='PENDING'");
 const {p}=await fixture();await reconcile.applyVerifiedPayment(evidence(p));const inbox=transport.memoryMailTransport();
 let attempts=0;const failAfterAccept=async(message,key)=>{attempts++;await inbox.send(message,key);throw new Error('response lost');};
 const failed=await mail.processMailJobs({transport:failAfterAccept});assert.equal(failed.failed,2);assert.equal(inbox.messages.size,2);assert.equal((await paymentRow(p.id)).fulfillment_status,'ISSUED');
 await db.pool.query("UPDATE mail_jobs SET next_attempt_at=NOW() WHERE state='PENDING'");
 const sent=await mail.processMailJobs({transport:inbox.send});assert.equal(sent.sent,2);assert.equal(inbox.messages.size,2);assert.equal(attempts,2);
 const service=load('lib/payment-status.server.ts');await service.buyerPaymentStatus(p.owner_email,{id:p.id});await service.buyerPaymentStatus(p.owner_email,{id:p.id});
 assert.equal((await mail.processMailJobs({transport:inbox.send})).sent,0);assert.equal(inbox.messages.size,2);
 for(const message of inbox.messages.values()){assert.deepEqual(message.to,[p.owner_email]);assert.ok(message.attachments[0].content);}
});
test('worker lease recovers crash before send; stale uncertainty needs review, not duplicate mail',async()=>{
 const {p}=await fixture();await reconcile.applyVerifiedPayment(evidence(p));const order=(await paymentRow(p.id)).order_id;
 await db.pool.query("UPDATE mail_jobs SET state='SENDING',lease_until=NOW()-interval '1 minute' WHERE source_id IN (SELECT id FROM tickets WHERE order_id=$1)",[order]);
 const inbox=transport.memoryMailTransport();assert.equal((await mail.processMailJobs({transport:inbox.send})).sent,2);
 const ticket=(await db.pool.query('SELECT id FROM tickets WHERE order_id=$1',[order])).rows[0];await mail.queueTicketResend(ticket.id,p.owner_email);
 await db.pool.query("UPDATE mail_jobs SET first_attempt_at=NOW()-interval '25 hours' WHERE state='PENDING'");
 assert.equal((await mail.processMailJobs({transport:inbox.send})).sent,0);assert.equal((await db.pool.query("SELECT count(*)::int n FROM mail_jobs WHERE source_id=$1 AND state='REVIEW'",[ticket.id])).rows[0].n,1);
});
test('authorized resend queues once; changed owner and cancelled ticket cancel delivery before QR render',async()=>{
 const {p}=await fixture();await reconcile.applyVerifiedPayment(evidence(p));const order=(await paymentRow(p.id)).order_id;
 const tickets=(await db.pool.query('SELECT id FROM tickets WHERE order_id=$1 ORDER BY id',[order])).rows;
 await assert.rejects(mail.queueTicketResend(tickets[0].id,'attacker@test.invalid'),e=>e.status===404);
 await Promise.all([mail.queueTicketResend(tickets[0].id,p.owner_email),mail.queueTicketResend(tickets[0].id,p.owner_email)]);
 assert.equal((await db.pool.query("SELECT count(*)::int n FROM mail_jobs WHERE source_id=$1 AND dedupe_key LIKE 'resend:%'",[tickets[0].id])).rows[0].n,1);
 await db.pool.query("UPDATE tickets SET owner_email='new-owner@test.invalid' WHERE id=$1",[tickets[0].id]);await db.pool.query("UPDATE tickets SET status='CANCELLED' WHERE id=$1",[tickets[1].id]);
 const inbox=transport.memoryMailTransport();await mail.processMailJobs({transport:inbox.send});assert.equal(inbox.messages.size,0);
});
test('disabled delivery is honest, and encrypted M3 security messages use same durable transport',async()=>{
 assert.deepEqual(await mail.processMailJobs(),{attempted:false,sent:0,failed:0});
 const id=randomUUID(),message={purpose:'VERIFY',to:'security@test.invalid',token:'fixture-secret',expiresAt:new Date(Date.now()+60000).toISOString()};
 await db.pool.query("INSERT INTO security_outbox(id,purpose,payload_cipher,expires_at) VALUES($1,'VERIFY',$2,$3)",[id,crypto.seal(JSON.stringify(message),`mail:${id}`),message.expiresAt]);
 const inbox=transport.memoryMailTransport();await mail.processMailJobs({transport:inbox.send});assert.equal(inbox.messages.size,1);assert.match([...inbox.messages.values()][0].html,/fixture-secret/);
 await mail.processMailJobs({transport:inbox.send});assert.equal(inbox.messages.size,1);assert.ok((await db.pool.query('SELECT delivered_at FROM security_outbox WHERE id=$1',[id])).rows[0].delivered_at);
 const auditText=JSON.stringify((await db.pool.query('SELECT metadata FROM security_audit')).rows);assert.doesNotMatch(auditText,/fixture-secret|contact@test|provider secret/);
});

for(const endpoint of ['demo/availability','demo/remaining','remaining']) test(`${endpoint} publishes only availability and uses shared expiry`,async()=>{
 const {p,event}=await fixture({qty:1,capacity:2});await db.pool.query("UPDATE holds SET expires_at=NOW()-interval '1 second' WHERE id=$1",[p.hold_id]);
 const route=load(`app/api/${endpoint}/route.ts`);const response=await route.GET(new Request(`https://ticketchile.test/api/${endpoint}?eventId=${event}`));
 assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.remainingByTicketTypeId.general,2);
 assert.doesNotMatch(JSON.stringify(payload),/buyerEmail|recentUsed|owner_email|usedAt|soldBy/);
 await db.pool.query('UPDATE events SET is_published=false WHERE id=$1',[event]);assert.equal((await route.GET(new Request(`https://ticketchile.test/api/${endpoint}?eventId=${event}`))).status,404);
});
test('finalizer refuses hold/payment owner mismatch before order creation',async()=>{
 const {p}=await fixture();await finalize.recordVerifiedPayment(evidence(p));await db.pool.query("UPDATE holds SET owner_email='foreign@test.invalid' WHERE id=$1",[p.hold_id]);
 await assert.rejects(finalize.finalizePayment(p.id),e=>e.code==='PAYMENT_MISMATCH');assert.equal((await counts(p)).tickets,0);
});
test('internal reconciliation recovers provider-paid payment without browser or webhook',async()=>{
 const {p}=await fixture();stripeResult=session(p);await db.pool.query("UPDATE payments SET updated_at=NOW()-interval '2 minutes' WHERE id=$1",[p.id]);
 const service=load('lib/payments/reconcile.server.ts',{'@/lib/stripe.server':{stripe:{checkout:{sessions:{retrieve:async id=>{
  if(id!==p.provider_ref) throw new Error('Other fixtures unavailable');return stripeResult;
 }}}}}});
 await service.reconcilePendingPayments(100);assert.equal((await paymentRow(p.id)).fulfillment_status,'ISSUED');assert.equal((await counts(p)).tickets,2);
});
test('expired security message is never dispatched and concurrent workers share one delivery job',async()=>{
 await db.pool.query("UPDATE mail_jobs SET state='CANCELLED' WHERE state='PENDING'");
 const id=randomUUID();await db.pool.query("INSERT INTO security_outbox(id,purpose,payload_cipher,expires_at) VALUES($1,'RESET',$2,NOW()-interval '1 second')",[id,crypto.seal(JSON.stringify({to:'expired@test.invalid',token:'expired'}),`mail:${id}`)]);
 const {p}=await fixture({qty:1});await reconcile.applyVerifiedPayment(evidence(p));const inbox=transport.memoryMailTransport();
 await Promise.all([mail.processMailJobs({transport:inbox.send}),mail.processMailJobs({transport:inbox.send})]);assert.equal(inbox.messages.size,1);assert.deepEqual([...inbox.messages.values()][0].to,[p.owner_email]);
 assert.equal((await db.pool.query("SELECT delivery_transport FROM mail_jobs WHERE source_id IN (SELECT id FROM tickets WHERE order_id=$1)",[(await paymentRow(p.id)).order_id])).rows[0].delivery_transport,'TEST');
});
test('a legacy PAID label cannot become verified from a pending provider observation',async()=>{
 const {p}=await fixture();await db.pool.query("UPDATE payments SET status='PAID' WHERE id=$1",[p.id]);
 await reconcile.applyVerifiedPayment(evidence(p,{status:'PENDING'}));
 assert.equal((await paymentRow(p.id)).verified_at,null);assert.equal((await counts(p)).tickets,0);
 await assert.rejects(finalize.finalizePayment(p.id),e=>e.code==='UNVERIFIED_PAYMENT');
});
