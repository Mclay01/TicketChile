import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {localDatabase} from './local-postgres.mjs';
import {loadSource} from './load-source.mjs';
let db,identity,crypto,service,sender,recipient,stranger,owner,actor;
const envKeys=['WALLET_RESOURCE_ENVIRONMENT','NEXTAUTH_URL','SECURITY_DATA_KEY','TICKETCHILE_QR_SECRET','APP_BASE_URL','GOOGLE_WALLET_ISSUER_ID','GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL','GOOGLE_WALLET_PRIVATE_KEY'];
const saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
const guard=loadSource('lib/buyer-guard.server.ts',{'@/auth':{},'next-auth/next':{getServerSession:async()=>null}});
const load=(file,extra={})=>loadSource(file,{'@/lib/db':db,'@/auth':{},'next-auth/next':{getServerSession:async()=>null},'@/lib/security/current.server':{currentIdentity:async()=>actor},'@/lib/buyer-guard.server':{...guard,getBuyerEmail:async()=>actor?.email},'@/lib/stripe.server':{stripe:{},appBaseUrl:()=>process.env.APP_BASE_URL},'@/lib/event-access.server':{requireEventAccess:async()=>({actor:owner,organizerId:owner.id})},'@/lib/mail/transport.server':{mailConfigured:()=>false,sendTransactionalMail:()=>{throw Error('External mail prohibited');}},'@/lib/tickets.email':{buildTicketEmail:({to,ticket})=>({to,from:'local@test.invalid',subject:'Ticket',html:ticket.qrPngBase64})},...extra});
async function fixture(){
 const id=`m11_${randomUUID()}`;
 await db.pool.query("INSERT INTO events(id,slug,title,city,venue,date_iso,description,is_published) VALUES($1,$1,'Transfer fixture','Santiago','Fixture',now()+interval '10 days','Synthetic',true)",[id]);
 await db.pool.query('INSERT INTO organizer_events(event_id,organizer_id) VALUES($1,$2)',[id,owner.id]);
 await db.pool.query("INSERT INTO ticket_types(id,event_id,name,price_clp,capacity) VALUES('general',$1,'General',1000,10)",[id]);
 await db.pool.query("INSERT INTO ticket_transfer_policies(event_id,enabled,fee_clp,allow_courtesy,identity_rule,approval_reference) VALUES($1,true,0,false,'NONE','Synthetic QA approval only')",[id]);
 await db.pool.query("INSERT INTO holds(id,event_id,status,expires_at,owner_email) VALUES($1,$1,'CONSUMED',now(),$2)",[id,sender.email]);
 await db.pool.query("INSERT INTO orders(id,hold_id,event_id,event_title,buyer_name,buyer_email,owner_email) VALUES($1,$1,$1,'Fixture','Private purchaser',$2,$2)",[id,sender.email]);
 await db.pool.query("INSERT INTO tickets(id,order_id,event_id,ticket_type_id,ticket_type_name,buyer_email,owner_email,status) VALUES($1,$1,$1,'general','General',$2,$2,'VALID')",[id,sender.email]);
 await db.pool.query("INSERT INTO payments(id,hold_id,provider,provider_intent,event_id,event_title,buyer_name,buyer_email,owner_email,amount_clp,status,order_id,verified_at,fulfillment_status) VALUES($1,$1,'stripe',$1,$1,'Fixture','Private purchaser',$2,$2,1000,'PAID',$1,now(),'ISSUED')",[id,sender.email]);
 return id;
}
async function invite(id,from=sender,to=recipient){const tr=await service.initiateTransfer(id,to.email,randomUUID(),from);return {id:tr.id,token:await tokenFor(tr.id)};}
async function tokenFor(id){const m=(await db.pool.query("SELECT * FROM ticket_transfer_messages WHERE transfer_id=$1 AND kind='INVITATION' ORDER BY revision DESC LIMIT 1",[id])).rows[0];return JSON.parse(crypto.unseal(m.payload_cipher,`transfer-mail:${m.id}`)).token;}
const row=async id=>(await db.pool.query('SELECT * FROM tickets WHERE id=$1',[id])).rows[0];
const scan=async(id,qrText)=>load('app/api/scanner/checkin/route.ts').POST(new Request('https://local/api/scanner/checkin',{method:'POST',headers:{origin:'https://local','content-type':'application/json'},body:JSON.stringify({eventId:id,qrText})}));
before(async()=>{
 Object.assign(process.env,{WALLET_RESOURCE_ENVIRONMENT:'development',NEXTAUTH_URL:'https://ticketchile.test',SECURITY_DATA_KEY:Buffer.alloc(32,11).toString('base64'),TICKETCHILE_QR_SECRET:'m11-only-synthetic-qr-key',APP_BASE_URL:'https://ticketchile.test'});
 db=await localDatabase();crypto=load('lib/security/crypto.server.ts');identity=load('lib/security/identity.server.ts');
 const users=[];for(const name of ['sender','recipient','stranger']){const id=randomUUID();await db.pool.query('INSERT INTO usuarios(id,nombre,email,email_verified_at) VALUES($1,$2,$3,now())',[id,name,`${name}@m11.test`]);users.push(await identity.principal('BUYER',id));}
 [sender,recipient,stranger]=users;actor=sender;
 await db.pool.query("INSERT INTO organizer_users(id,username,password_hash,verified,approved) VALUES('m11-owner','m11-owner','disabled',true,true)");owner=await identity.principal('ORGANIZER','m11-owner');service=load('lib/transfers.server.ts');
});
beforeEach(async()=>{await db.pool.query('DELETE FROM security_rate_limits');actor=sender;});
after(async()=>{await db?.pool.end();for(const [k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
test('profile updates only current identity and rejects email, RUT, id injection and malformed fields',async()=>{
 const profile=load('lib/buyer-profile.server.ts');await profile.updateBuyerProfile({name:'Updated buyer',phone:'+56 9 1234 5678'},sender);
 assert.equal((await db.pool.query('SELECT nombre FROM usuarios WHERE id=$1',[sender.id])).rows[0].nombre,'Updated buyer');
 assert.equal((await db.pool.query('SELECT nombre FROM usuarios WHERE id=$1',[recipient.id])).rows[0].nombre,'recipient');
 for(const body of [{name:'X',phone:''},{name:'Valid',phone:'script'},{name:'Valid',email:'other@test.invalid'},{name:'Valid',rut:'1'},{name:'Valid',id:recipient.id}])await assert.rejects(profile.updateBuyerProfile(body,sender),{code:'INVALID_PROFILE'});
 await assert.rejects(profile.updateBuyerProfile({name:'Valid',phone:''},{...sender,version:0}),{status:401});
});
test('nonowner and stale identity cannot initiate; unknown recipient receives same durable response',async()=>{
 const id=await fixture();await assert.rejects(service.initiateTransfer(id,recipient.email,randomUUID(),stranger),{status:404});
 await assert.rejects(service.initiateTransfer(id,recipient.email,randomUUID(),{...sender,version:0}),{status:401});
 const tr=await service.initiateTransfer(id,'new-person@m11.test',randomUUID(),sender);assert.equal(tr.state,'PENDING');assert.ok(await tokenFor(tr.id));
});
test('transfer policy fails closed for absent, disabled, charged, identity-required, tier, deadline and count rules',async()=>{
 const id=await fixture();
 for(const sql of ["enabled=false","enabled=true,fee_clp=NULL","fee_clp=1","fee_clp=0,identity_rule='IDENTITY_REQUIRED'","identity_rule='NON_TRANSFERABLE'","identity_rule='NONE',deadline=now()-interval '1 second'"]){await db.pool.query(`UPDATE ticket_transfer_policies SET ${sql} WHERE event_id=$1`,[id]);await assert.rejects(invite(id),{code:'TRANSFER_UNAVAILABLE'});}
 await db.pool.query('UPDATE ticket_transfer_policies SET deadline=NULL WHERE event_id=$1',[id]);await db.pool.query('UPDATE ticket_types SET transfer_disabled=true WHERE event_id=$1',[id]);await assert.rejects(invite(id),{code:'TRANSFER_UNAVAILABLE'});
 await db.pool.query('DELETE FROM ticket_transfer_policies WHERE event_id=$1',[id]);await assert.rejects(invite(id),{code:'TRANSFER_UNAVAILABLE'});
});
test('used, cancelled and checked-in tickets are ineligible',async()=>{for(const status of ['USED','CANCELLED']){const id=await fixture();await db.pool.query('UPDATE tickets SET status=$2 WHERE id=$1',[id,status]);await assert.rejects(invite(id),{code:'TRANSFER_UNAVAILABLE'});}const id=await fixture();await db.pool.query('UPDATE tickets SET used_at=now() WHERE id=$1',[id]);await assert.rejects(invite(id),{code:'TRANSFER_UNAVAILABLE'});});

test('global transfer incident switch denies initiation and acceptance but retains owner cancellation',async()=>{
 const id=await fixture(),claim=await invite(id),old=process.env.TRANSFERS_ENABLED;
 process.env.TRANSFERS_ENABLED='false';
 try{
  await assert.rejects(service.acceptTransfer(claim.token,recipient),{code:'TRANSFER_UNAVAILABLE'});
  await assert.rejects(invite(await fixture()),{code:'TRANSFER_UNAVAILABLE'});
  await service.manageTransfer(claim.id,'cancel',sender);
  assert.equal((await row(id)).credential_version,0);
 }finally{if(old===undefined)delete process.env.TRANSFERS_ENABLED;else process.env.TRANSFERS_ENABLED=old;}
});
test('duplicate initiation has one pending claim and replay cannot alter recipient',async()=>{
 const id=await fixture(),key=randomUUID();const r=await Promise.all(Array.from({length:5},()=>service.initiateTransfer(id,recipient.email,key,sender)));assert.equal(new Set(r.map(x=>x.id)).size,1);
 await assert.rejects(service.initiateTransfer(id,stranger.email,key,sender),{code:'REQUEST_CONFLICT'});await assert.rejects(invite(id),{code:'TRANSFER_PENDING'});
 assert.equal((await row(id)).owner_email,sender.email);assert.equal((await row(id)).credential_version,0);
});
test('claim denies malformed, wrong recipient, expired and cancelled invitations',async()=>{
 const id=await fixture(),tr=await invite(id);await assert.rejects(service.inspectTransferClaim('bad',recipient),{code:'INVALID_CLAIM'});await assert.rejects(service.inspectTransferClaim(tr.token,stranger),{code:'WRONG_RECIPIENT'});
 await db.pool.query("UPDATE ticket_transfers SET expires_at=now()-interval '1 second' WHERE id=$1",[tr.id]);await assert.rejects(service.acceptTransfer(tr.token,recipient),{code:'CLAIM_EXPIRED'});
 const tr2=await invite(id);await service.manageTransfer(tr2.id,'cancel',sender);await service.manageTransfer(tr2.id,'cancel',sender);await assert.rejects(service.acceptTransfer(tr2.token,recipient),{code:'CLAIM_CANCELLED'});
});
test('acceptance atomically changes owner, rotates QR, records immutable history and prevents replay/cancel',async()=>{
 const id=await fixture(),tr=await invite(id);await service.acceptTransfer(tr.token,recipient);const t=await row(id);assert.equal(t.owner_email,recipient.email);assert.equal(t.credential_version,1);
 await assert.rejects(service.acceptTransfer(tr.token,recipient),{code:'ALREADY_ACCEPTED'});await assert.rejects(service.manageTransfer(tr.id,'cancel',sender),{status:404});
 const h=await service.transferDetail(id,recipient);assert.equal(h.history.length,2);assert.equal(h.history[0].sequence,1);assert.ok(h.history[0].initiatedAt);assert.equal((await service.transferDetail(id,sender)).own,false);await assert.rejects(service.transferDetail(id,stranger),{status:404});
 await assert.rejects(db.pool.query('UPDATE ticket_ownership_history SET owner_email=$2 WHERE ticket_id=$1',[id,stranger.email]));
 const pay=(await db.pool.query('SELECT owner_email FROM payments WHERE id=$1',[id])).rows[0];assert.equal(pay.owner_email,sender.email);
 const audit=(await db.pool.query("SELECT action,metadata FROM security_audit WHERE target_id=$1",[id])).rows;assert.equal(audit.filter(a=>a.action==='transfer.accepted').length,1);assert.ok(!JSON.stringify(audit).includes(tr.token));
});
test('simultaneous accepts have one winner and one credential increment',async()=>{const id=await fixture(),tr=await invite(id),r=await Promise.allSettled(Array.from({length:6},()=>service.acceptTransfer(tr.token,recipient)));assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal((await row(id)).credential_version,1);});
test('cancel versus accept has one coherent winner',async()=>{const id=await fixture(),tr=await invite(id),r=await Promise.allSettled([service.manageTransfer(tr.id,'cancel',sender),service.acceptTransfer(tr.token,recipient)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);const t=await row(id),state=(await db.pool.query('SELECT state FROM ticket_transfers WHERE id=$1',[tr.id])).rows[0].state;assert.equal(t.owner_email,state==='ACCEPTED'?recipient.email:sender.email);assert.equal(t.credential_version,state==='ACCEPTED'?1:0);});
test('legacy and tc2 zero QR remain valid before transfer; stale generations fail after transfer',async()=>{
 const qr=load('lib/qr-token.server.ts');for(const version of [undefined,0]){const id=await fixture();assert.equal((await scan(id,qr.signTicketToken({ticketId:id,eventId:id,credentialVersion:version}))).status,200);}
 const id=await fixture(),tr=await invite(id),old=qr.signTicketToken({ticketId:id,eventId:id});await service.acceptTransfer(tr.token,recipient);assert.equal((await (await scan(id,old)).json()).code,'INVALID_QR');
 const fresh=qr.signTicketToken({ticketId:id,eventId:id,credentialVersion:1});assert.equal((await scan(id,fresh)).status,200);assert.equal(qr.verifyTicketToken(fresh.replace('.1.','.2.')),null);
});
test('check-in versus acceptance cannot admit a revoked QR or transfer a used ticket',async()=>{
 for(let i=0;i<4;i++){const id=await fixture(),tr=await invite(id),qr=load('lib/qr-token.server.ts').signTicketToken({ticketId:id,eventId:id});const r=await Promise.allSettled([scan(id,qr),service.acceptTransfer(tr.token,recipient)]);const t=await row(id);if(t.status==='USED'){assert.equal(t.owner_email,sender.email);assert.equal(t.credential_version,0);assert.equal(r[1].status,'rejected');}else{assert.equal(t.owner_email,recipient.email);assert.notEqual(r[0].value.status,200);}}
});
test('resend rotates one claim, suppresses old mail and is persistently throttled',async()=>{
 const id=await fixture(),tr=await invite(id);await service.manageTransfer(tr.id,'resend',sender);await assert.rejects(service.inspectTransferClaim(tr.token,recipient),{code:'INVALID_CLAIM'});const fresh=await tokenFor(tr.id);assert.notEqual(fresh,tr.token);assert.ok(await service.inspectTransferClaim(fresh,recipient));
 for(let i=0;i<4;i++)await service.manageTransfer(tr.id,'resend',sender);await assert.rejects(service.manageTransfer(tr.id,'resend',sender),{status:429});
});
test('complimentary tickets require explicit configuration and retain issuance metadata',async()=>{
 const id=await fixture(),issue=randomUUID();await db.pool.query("INSERT INTO complimentary_issues(id,order_id,event_id,ticket_type_id,qty,actor_kind,actor_id,request_key,request_hash,reason) VALUES($1,$2,$2,'general',1,'ORGANIZER','m11-owner',$3,'fixture','Synthetic')",[issue,id,randomUUID()]);
 await assert.rejects(invite(id),{code:'TRANSFER_UNAVAILABLE'});await db.pool.query('UPDATE ticket_transfer_policies SET allow_courtesy=true WHERE event_id=$1',[id]);const tr=await invite(id);await service.acceptTransfer(tr.token,recipient);assert.equal((await db.pool.query('SELECT id FROM complimentary_issues WHERE order_id=$1',[id])).rows[0].id,issue);
});
async function refund(id){const rid=randomUUID();await db.pool.query("INSERT INTO refunds(id,payment_id,order_id,amount_clp,status,first_attempt_at) VALUES($1,$2,$2,1000,'PROCESSING',now())",[rid,id]);await db.pool.query('INSERT INTO refund_tickets(refund_id,ticket_id) VALUES($1,$2)',[rid,id]);return rid;}
const evidence=(id,rid)=>({id:`re_${rid}`,metadata:{refundId:rid,paymentId:id},payment_intent:id,amount:1000,currency:'clp',status:'succeeded'});
test('pending refund blocks transfer; completed refund cancels the current owner after transfer',async()=>{
 const id=await fixture(),tr=await invite(id);await service.acceptTransfer(tr.token,recipient);const rid=await refund(id);await load('lib/payments/refunds.server.ts').applyStripeRefund(evidence(id,rid),'WEBHOOK');assert.equal((await row(id)).status,'CANCELLED');assert.equal((await row(id)).owner_email,recipient.email);await assert.rejects(invite(id,recipient,sender),{code:'TRANSFER_UNAVAILABLE'});
});
test('refund versus accept serializes and cannot revive a refunded ticket',async()=>{
 const id=await fixture(),tr=await invite(id),rid=await refund(id),r=await Promise.allSettled([service.acceptTransfer(tr.token,recipient),load('lib/payments/refunds.server.ts').applyStripeRefund(evidence(id,rid),'API')]);assert.equal(r[0].status,'rejected');assert.equal(r[1].status,'fulfilled');assert.equal((await row(id)).status,'CANCELLED');assert.equal((await row(id)).credential_version,0);
});
test('policy and event changes are revalidated at acceptance',async()=>{const id=await fixture(),tr=await invite(id);await db.pool.query('UPDATE ticket_transfer_policies SET enabled=false WHERE event_id=$1',[id]);await assert.rejects(service.acceptTransfer(tr.token,recipient),{code:'TRANSFER_UNAVAILABLE'});await db.pool.query('UPDATE ticket_transfer_policies SET enabled=true WHERE event_id=$1',[id]);await db.pool.query("UPDATE events SET lifecycle='ENDED',is_published=false WHERE id=$1",[id]);await assert.rejects(service.acceptTransfer(tr.token,recipient),{code:'TRANSFER_UNAVAILABLE'});});
test('Wallet and QR enforce new owner and current generation; object IDs change on rotation',async()=>{
 Object.assign(process.env,{GOOGLE_WALLET_ISSUER_ID:'local',GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL:'local@test.invalid',GOOGLE_WALLET_PRIVATE_KEY:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})});
 const id=await fixture(),wallet=load('app/api/wallet/google/save-url/route.ts'),url=`https://local/api/wallet/google/save-url?ticketId=${id}&format=json`,old=jwt.decode((await (await wallet.GET(new Request(url))).json()).saveUrl.split('/').at(-1)).payload.eventTicketObjects[0];
 const tr=await invite(id);await service.acceptTransfer(tr.token,recipient);assert.equal((await wallet.GET(new Request(url))).status,404);actor=recipient;
 const fresh=jwt.decode((await (await wallet.GET(new Request(url))).json()).saveUrl.split('/').at(-1)).payload.eventTicketObjects[0];assert.notEqual(old.id,fresh.id);assert.equal(load('lib/qr-token.server.ts').verifyTicketToken(fresh.barcode.value).credentialVersion,1);
 const access=load('lib/ticket-access.server.ts');await assert.rejects(access.ownedTicketFromRequest(new Request(`https://local?t=${old.barcode.value}`)),{code:'INVALID_QR'});assert.equal((await access.ownedTicketFromRequest(new Request(`https://local?ticketId=${id}`))).owner_email,recipient.email);
});
test('mail failure leaves pending and accepted state intact; old recipient jobs are cancelled',async()=>{
 const id=await fixture(),mail=load('lib/mail/jobs.server.ts');await mail.queueTicketResend(id,sender.email);const tr=await invite(id);const result=await mail.processMailJobs({transport:async()=>{throw Error('Synthetic transport failure');},limit:100});assert.ok(result.failed>0);assert.equal((await row(id)).owner_email,sender.email);
 await service.acceptTransfer(tr.token,recipient);await mail.processMailJobs({transport:async()=>{throw Error('Synthetic transport failure');},limit:100});assert.equal((await row(id)).owner_email,recipient.email);assert.equal((await db.pool.query("SELECT state FROM mail_jobs WHERE purpose='TICKET' AND source_id=$1 AND recipient=$2",[id,sender.email])).rows[0].state,'CANCELLED');
});
test('round-trip transfer cannot revive an old QR or encrypted ticket mail snapshot',async()=>{
 const id=await fixture(),first=await invite(id);await service.acceptTransfer(first.token,recipient);const second=await invite(id,recipient,sender);await service.acceptTransfer(second.token,sender);assert.equal((await row(id)).credential_version,2);
 const qr=load('lib/qr-token.server.ts');for(const v of [undefined,0,1])assert.equal((await (await scan(id,qr.signTicketToken({ticketId:id,eventId:id,credentialVersion:v}))).json()).code,'INVALID_QR');
 const oldJob=randomUUID();await db.pool.query("INSERT INTO mail_jobs(id,dedupe_key,purpose,source_id,recipient,credential_version,payload_cipher) VALUES($1::uuid,$1::text,'TICKET',$2,$3,0,$4)",[oldJob,id,sender.email,crypto.seal(JSON.stringify({to:[sender.email],html:'old-qr'}),`delivery:${oldJob}`)]);
 const sent=[];await load('lib/mail/jobs.server.ts').processMailJobs({transport:async m=>sent.push(m),limit:100});assert.ok(!sent.some(m=>m.html==='old-qr'));assert.equal((await db.pool.query('SELECT state FROM mail_jobs WHERE id=$1',[oldJob])).rows[0].state,'CANCELLED');
});
test('maximum count is enforced after an accepted transfer and old owners only see historical tickets',async()=>{
 const id=await fixture();await db.pool.query('UPDATE ticket_transfer_policies SET max_transfers=1 WHERE event_id=$1',[id]);const tr=await invite(id);await service.acceptTransfer(tr.token,recipient);await assert.rejects(invite(id,recipient,sender),{code:'TRANSFER_UNAVAILABLE'});
 const account=load('lib/account.server.ts');const old=await account.buyerTicket(id);assert.equal(old.current_owner,false);assert.equal(old.transfer_state,'TRANSFERRED_AWAY');assert.ok(!JSON.stringify(old).includes(recipient.email));assert.ok((await account.buyerTickets('transferred')).tickets.some(t=>t.id===id));actor=stranger;assert.equal(await account.buyerTicket(id),null);
});
test('policy configuration repeats live event scope and requires explicit complete business inputs',async()=>{
 const id=await fixture(),policy=load('lib/transfer-policy.server.ts'),body={enabled:true,deadline:null,maxTransfers:null,feeClp:0,allowCourtesy:false,identityRule:'NONE',approvalReference:'Synthetic QA only',disabledTiers:[]};
 for(const invalid of [{...body,feeClp:undefined},{...body,allowCourtesy:undefined},{...body,approvalReference:''},{...body,disabledTiers:['foreign']}])await assert.rejects(policy.configureTransferPolicy(id,invalid));
 await policy.configureTransferPolicy(id,{...body,disabledTiers:['general']});await assert.rejects(invite(id),{code:'TRANSFER_UNAVAILABLE'});
 const foreign=load('lib/transfer-policy.server.ts',{'@/lib/event-access.server':{requireEventAccess:async()=>({actor:stranger,organizerId:'foreign'})}});await assert.rejects(foreign.configureTransferPolicy(id,body),{status:404});
});
test('audit or durable queue persistence failure rolls back the complete acceptance transaction',async()=>{
 const id=await fixture(),tr=await invite(id),before=(await db.pool.query('SELECT count(*)::int n FROM mail_jobs')).rows[0].n;
 const broken=load('lib/transfers.server.ts',{'@/lib/security/audit.server':{audit:async()=>{throw Error('Synthetic audit outage');}}});await assert.rejects(broken.acceptTransfer(tr.token,recipient),/Synthetic audit outage/);
 assert.equal((await row(id)).credential_version,0);assert.equal((await row(id)).owner_email,sender.email);assert.equal((await db.pool.query('SELECT count(*)::int n FROM mail_jobs')).rows[0].n,before);assert.equal((await db.pool.query('SELECT state FROM ticket_transfers WHERE id=$1',[tr.id])).rows[0].state,'PENDING');await service.acceptTransfer(tr.token,recipient);
});
test('concurrent refund request and transfer acceptance preserve payment owner and final cancellation',async()=>{
 const adminId='m11-refund-admin';await db.pool.query("INSERT INTO admin_users(id,username,password_hash,role) VALUES($1,$1,'disabled','SUPERADMIN') ON CONFLICT DO NOTHING",[adminId]);await db.pool.query("INSERT INTO identity_mfa(kind,principal_id,enabled) VALUES('ADMIN',$1,true) ON CONFLICT DO NOTHING",[adminId]);const admin=await identity.principal('ADMIN',adminId),refunds=load('lib/payments/refunds.server.ts');
 for(let i=0;i<3;i++){
  const id=await fixture(),tr=await invite(id),input={action:'refund.request',target:id,reason:'Synthetic race',confirmation:`refund.request ${id}`,requestKey:randomUUID()};
  const results=await Promise.allSettled([service.acceptTransfer(tr.token,recipient),refunds.refundOperation(input,admin)]);assert.equal(results[1].status,'fulfilled',results[1].reason?.message);
  const r=(await db.pool.query('SELECT id FROM refunds WHERE payment_id=$1',[id])).rows[0];await db.pool.query("UPDATE refunds SET status='PROCESSING',first_attempt_at=now() WHERE id=$1",[r.id]);await refunds.applyStripeRefund(evidence(id,r.id),'WEBHOOK');const t=await row(id);assert.equal(t.status,'CANCELLED');assert.equal(t.owner_email,results[0].status==='fulfilled'?recipient.email:sender.email);
  const signed=load('lib/qr-token.server.ts').signTicketToken({ticketId:id,eventId:id,credentialVersion:t.credential_version});assert.notEqual((await scan(id,signed)).status,200);
 }
});
test('successful invitation mail retries preserve encrypted payload and delivery idempotency',async()=>{
 // Isolate from prior fixtures so the intended send is deterministic.
 await db.pool.query("UPDATE mail_jobs SET state='CANCELLED' WHERE state IN ('PENDING','SENDING')");
 const id=await fixture(),tr=await invite(id),mail=load('lib/mail/jobs.server.ts'),calls=[];
 await mail.processMailJobs({transport:async(m,key)=>{calls.push({m,key});throw Error('Unknown provider result');},limit:1});
 await db.pool.query("UPDATE mail_jobs SET next_attempt_at=now() WHERE state='PENDING'");await mail.processMailJobs({transport:async(m,key)=>calls.push({m,key}),limit:1});
 assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.ok(calls[0].m.html.includes(`/transferir#${tr.token}`));
 const stored=(await db.pool.query("SELECT payload_cipher FROM mail_jobs WHERE dedupe_key LIKE 'transfer:%' AND state='SENT' ORDER BY sent_at DESC LIMIT 1")).rows[0];assert.ok(!stored.payload_cipher.includes(tr.token));
});
