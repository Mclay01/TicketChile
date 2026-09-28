import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {localDatabase} from '../tests/local-postgres.mjs';
import {loadSource} from '../tests/load-source.mjs';
import {migrate} from './migrate.mjs';

// No env files; source and target are newly created on the fixed disposable cluster.
const source=await localDatabase(),target=await localDatabase({applyMigrations:false});
Object.assign(process.env,{SECURITY_DATA_KEY:Buffer.alloc(32,13).toString('base64'),APP_ENVIRONMENT:'development',VERCEL_ENV:'',NODE_ENV:'test',MEDIA_PROVIDER:'local',MEDIA_UPLOADS_ENABLED:'true',TRANSFERS_ENABLED:'true',CHECKOUT_FEE_POLICY:'none',APP_BASE_URL:'https://fixture.test',NEXTAUTH_URL:'https://fixture.test',TICKETCHILE_QR_SECRET:'m13-synthetic-qr-secret-never-deploy'});
const load=(file,db=source,extra={})=>loadSource(file,{'@/lib/db':db,'@/auth':{},'next-auth/next':{getServerSession:async()=>null},'@/lib/security/current.server':{},'./adapters.server':{},...extra});
const directory=path.resolve('.local/m13-restore');await fs.mkdir(directory,{recursive:true});
const file=path.join(directory,`${source.database}.dump`),started=Date.now();
async function snapshot(db){
 const tables=(await db.pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const result={};
 for(const {tablename}of tables){assert.match(tablename,/^[a-z_]+$/);const rows=(await db.pool.query(`SELECT row_to_json(t)::text AS value FROM "${tablename}" t ORDER BY row_to_json(t)::text`)).rows;result[tablename]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}
 return result;
}
function pg(command,args){
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
 const run=spawnSync(command,['--host=127.0.0.1','--port=55439','--username=ticket_local','--no-password',...args],{env,encoding:'utf8',windowsHide:true});
 if(run.status!==0)throw Error(`${command} rehearsal failed (${run.status}): ${run.stderr}`);
}
try{
 await source.pool.query(`INSERT INTO organizer_users(id,username,password_hash,verified,approved) VALUES('m13-owner','m13-owner','disabled',true,true);
 INSERT INTO admin_users(id,username,password_hash,role) VALUES('m13-admin','m13-admin','disabled','SUPERADMIN');
 INSERT INTO usuarios(id,nombre,email,email_verified_at) VALUES('11111111-1111-4111-8111-111111111111','Synthetic sender','sender@m13.test',now()),('22222222-2222-4222-8222-222222222222','Synthetic recipient','recipient@m13.test',now());
 INSERT INTO events(id,slug,title,city,venue,date_iso,description,is_published) VALUES('m13-event','m13-event','M13 synthetic rehearsal','Santiago','Synthetic venue',now()+interval '30 days','Synthetic rehearsal only',true);
 INSERT INTO organizer_events(event_id,organizer_id) VALUES('m13-event','m13-owner');
 INSERT INTO ticket_types(id,event_id,name,price_clp,capacity,max_per_order) VALUES('general','m13-event','General',1000,100,4);
 INSERT INTO commission_versions(id,scope,event_id,basis_points,fixed_clp,effective_at,policy_reference,actor_id) VALUES('33333333-3333-4333-8333-333333333333','EVENT','m13-event',500,0,now()-interval '1 day','Synthetic fixture; not business approval','m13-admin');
 INSERT INTO ticket_transfer_policies(event_id,enabled,fee_clp,allow_courtesy,identity_rule,approval_reference) VALUES('m13-event',true,0,false,'NONE','Synthetic fixture only');`);
 const created=await load('lib/payments/create.server.ts').preparePayment('sender@m13.test','stripe',{eventId:'m13-event',buyerName:'Synthetic sender',buyerEmail:'sender@m13.test',items:[{ticketTypeId:'general',qty:2}]},randomUUID());
 await source.pool.query("UPDATE payments SET provider_ref='cs_synthetic_restore',creation_state='READY' WHERE id=$1",[created.id]);
 const finalizer=load('lib/payments/finalize.server.ts');
 await finalizer.recordVerifiedPayment({provider:'stripe',reference:'cs_synthetic_restore',paymentId:created.id,holdId:created.hold_id,amount:2000,currency:'CLP',status:'PAID',observationKey:'synthetic-no-provider-call'});
 await finalizer.finalizePayment(created.id);
 const identity=load('lib/security/identity.server.ts'),crypto=load('lib/security/crypto.server.ts'),transfer=load('lib/transfers.server.ts');
 const sender=await identity.principal('BUYER','11111111-1111-4111-8111-111111111111'),recipient=await identity.principal('BUYER','22222222-2222-4222-8222-222222222222');
 const ticket=(await source.pool.query('SELECT id FROM tickets ORDER BY id LIMIT 1')).rows[0].id;
 const invite=await transfer.initiateTransfer(ticket,recipient.email,randomUUID(),sender);
 const message=(await source.pool.query('SELECT * FROM ticket_transfer_messages WHERE transfer_id=$1',[invite.id])).rows[0];
 await transfer.acceptTransfer(JSON.parse(crypto.unseal(message.payload_cipher,`transfer-mail:${message.id}`)).token,recipient);
 const bytes=await sharp({create:{width:32,height:24,channels:3,background:'blue'}}).png().toBuffer();
 await source.pool.query('UPDATE events SET image=$1 WHERE id=$2',[`data:image/png;base64,${bytes.toString('base64')}`,'m13-event']);
 const storage=load('lib/media-storage.server.ts').localMediaStore(path.join(directory,'objects'));
 const adoption=load('lib/media-adoption.server.ts');
 const before=await snapshot(source);await adoption.adoptLegacyMedia({dryRun:true,limit:1,store:storage});assert.deepEqual(await snapshot(source),before);
 await adoption.adoptLegacyMedia({dryRun:false,limit:1,store:storage});
 await adoption.adoptLegacyMedia({dryRun:false,limit:1,store:storage}); // deterministic resume/replay
 assert.equal((await source.pool.query("SELECT count(*)::int n FROM media_legacy_adoptions WHERE state='APPLIED' AND original_value LIKE 'data:%'")).rows[0].n,1);
 const proposal='44444444-4444-4444-8444-444444444444',cipher=crypto.seal(JSON.stringify({patch:{title:'Editable synthetic proposal'}}),'m13-restore-proposal');
 await source.pool.query("INSERT INTO ai_requests(id,subject_hash,input_hash,event_id,actor_kind,actor_id,feature,provider,model,state,result_ciphertext) VALUES($1,'synthetic','synthetic','m13-event','ORGANIZER','m13-owner','title','LOCAL_RULES','deterministic-v1','SUCCEEDED',$2)",[proposal,cipher]);
 const expected=await snapshot(source);
 pg('pg_dump',['--format=custom','--no-owner','--no-acl',`--file=${file}`,source.database]);
 const dumped=Date.now();
 pg('pg_restore',['--exit-on-error','--no-owner','--no-acl',`--dbname=${target.database}`,file]);
 const restored=Date.now();assert.deepEqual(await snapshot(target),expected);
 await migrate(target.pool); // verifies all checksums; no replay or down migrations
 const catalog=await load('lib/events.server.ts',target).catalogDb();assert.equal(catalog.total,1);
 const account=load('lib/account.server.ts',target,{'@/lib/ticket-access.server':{requireBuyerEmail:async()=>recipient.email}});
 const owned=await account.buyerTicket(ticket);assert.equal(owned.owner_email,recipient.email);assert.equal(owned.credential_version,1);
 assert.equal((await target.pool.query('SELECT amount_clp,owner_email FROM payments')).rows[0].owner_email,sender.email);
 assert.equal((await target.pool.query('SELECT commission_clp FROM payment_finance_snapshots')).rows[0].commission_clp,100);
 assert.equal(crypto.unseal((await target.pool.query('SELECT result_ciphertext FROM ai_requests WHERE id=$1',[proposal])).rows[0].result_ciphertext,'m13-restore-proposal'),JSON.stringify({patch:{title:'Editable synthetic proposal'}}));
 for(const v of (await target.pool.query('SELECT * FROM media_variants')).rows)assert.equal(createHash('sha256').update(await storage.get(v.object_key)).digest('hex'),v.checksum);
 const constraints=(await target.pool.query("SELECT count(*)::int n FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f' AND convalidated")).rows[0].n;
 const report={at:new Date().toISOString(),migrations:11,source:source.database,target:target.database,tables:Object.keys(expected).length,nonemptyTables:Object.entries(expected).filter(([,v])=>v.count).map(([name,v])=>({name,count:v.count})),foreignKeys:constraints,backupBytes:(await fs.stat(file)).size,dumpAndFixtureMs:dumped-started,restoreMs:restored-dumped,verified:['all table row counts and hashes identical','migration checksum ledger','real catalog and current-owner account reads','payer unchanged; transferred credential/history retained','commission snapshot','AI ciphertext decrypts with retained synthetic key','legacy original retained; adoption replay; variant hashes'],limitations:['Local PostgreSQL only; no managed-provider PITR or production RTO/RPO certification','Object files retained separately; database backup does not back up a bucket']};
 await fs.mkdir('../../docs/03-implementation/qa/m13',{recursive:true});await fs.writeFile('../../docs/03-implementation/qa/m13/restore-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await source.pool.end();await target.pool.end();}
