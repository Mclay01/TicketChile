import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import dotenv from 'dotenv';
import {localDatabase} from '../tests/local-postgres.mjs';
import {loadSource} from '../tests/load-source.mjs';
// Entirely synthetic, loopback-only. Only env-file key names are used to scrub configuration.
const env={...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',TICKETCHILE_BUILD_DIR:'.next-astra'};
for(const name of ['.env','.env.local','.env.development','.env.development.local','.env.production','.env.production.local'])if(fs.existsSync(name))for(const key of Object.keys(dotenv.parse(fs.readFileSync(name))))env[key]='';
for(const key of Object.keys(env))if(/^(AI_|OPENAI_|STRIPE_|FLOW_|WEBPAY_|FINTOC_|RESEND_|MAIL_|CHECKOUT_|FROM_EMAIL$|GOOGLE_|AUTH_|SECURITY_|NEXTAUTH_|TRANSFER_|ORGANIZER_|ADMIN_BOOTSTRAP_|APP_|NEXT_PUBLIC_|SUPPORT_)/.test(key))env[key]='';
const db=await localDatabase(),url=`postgresql://ticket_local@127.0.0.1:55439/${db.database}`;
for(const key of ['TICKETCHILE_DB_POSTGRES_URL','TICKETCHILE_DB_POSTGRES_URL_NON_POOLING','POSTGRES_URL','POSTGRES_URL_NON_POOLING','POSTGRES_PRISMA_URL','DATABASE_URL'])env[key]=url;
Object.assign(env,{DATABASE_SSL:'false',SECURITY_DATA_KEY:Buffer.alloc(32,11).toString('base64'),NEXTAUTH_SECRET:'m11-synthetic-session-secret',NEXTAUTH_URL:'http://localhost:3005',NEXTAUTH_URL_INTERNAL:'http://localhost:3005',APP_BASE_URL:'http://localhost:3005',TICKETCHILE_QR_SECRET:'m11-synthetic-qr-secret',STRIPE_SECRET_KEY:'sk_test_disabled',RESEND_API_KEY:'re_disabled',GOOGLE_WALLET_ISSUER_ID:'123456789',GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL:'wallet@test.invalid',GOOGLE_WALLET_PRIVATE_KEY:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})});
process.env.SECURITY_DATA_KEY=env.SECURITY_DATA_KEY;
const overrides={'@/lib/db':db,'@/auth':{},'next-auth/next':{getServerSession:async()=>null},'@/lib/security/current.server':{currentIdentity:async()=>{throw Error('Explicit fixture identity required');}}};
const crypto=loadSource('lib/security/crypto.server.ts'),identity=loadSource('lib/security/identity.server.ts',overrides),transfers=loadSource('lib/transfers.server.ts',overrides);
const password='M11-local-fixture-password!',hash=await crypto.hashPassword(password);
for(const name of ['sender','recipient'])await db.pool.query('INSERT INTO usuarios(id,nombre,email,password_hash,email_verified_at) VALUES($1,$2,$3,$4,now())',[randomUUID(),`Persona ${name}`,`${name}@m11.test`,hash]);
const sender=await identity.findIdentity('BUYER','sender@m11.test');
await db.pool.query("INSERT INTO events(id,slug,title,city,venue,date_iso,description,image,is_published) VALUES('m11-event','m11-event','Cordillera Sonora','Santiago','Teatro de prueba',now()+interval '20 days','Evento sintético para QA local.','/events/noche-rock.jpg',true)");
await db.pool.query("INSERT INTO ticket_types(id,event_id,name,price_clp,capacity) VALUES('general','m11-event','General',10000,100)");
await db.pool.query("INSERT INTO ticket_transfer_policies(event_id,enabled,fee_clp,allow_courtesy,identity_rule,approval_reference) VALUES('m11-event',true,0,false,'NONE','Synthetic QA approval only')");
const tokens={};
for(const suffix of ['390','430','768','1024','1440','expired','cancelled','invalid','wrong','used','refunded']){
 const id=`m11-${suffix}`;
 await db.pool.query("INSERT INTO holds(id,event_id,status,expires_at,owner_email) VALUES($1,'m11-event','CONSUMED',now(),'sender@m11.test')",[id]);
 await db.pool.query("INSERT INTO orders(id,hold_id,event_id,event_title,buyer_name,buyer_email,owner_email) VALUES($1,$1,'m11-event','Cordillera Sonora','Persona sender','sender@m11.test','sender@m11.test')",[id]);
 await db.pool.query("INSERT INTO tickets(id,order_id,event_id,ticket_type_id,ticket_type_name,buyer_email,owner_email,status) VALUES($1,$1,'m11-event','general','General','sender@m11.test','sender@m11.test','VALID')",[id]);
 await db.pool.query("INSERT INTO payments(id,hold_id,provider,event_id,event_title,buyer_name,buyer_email,owner_email,amount_clp,status,order_id,verified_at,fulfillment_status) VALUES($1,$1,'stripe','m11-event','Fixture','Persona sender','sender@m11.test','sender@m11.test',10000,'PAID',$1,now(),'ISSUED')",[id]);
 if(['expired','cancelled','invalid','wrong'].includes(suffix)){
  const tr=await transfers.initiateTransfer(id,suffix==='wrong'?'different@m11.test':'recipient@m11.test',randomUUID(),sender);
  const m=(await db.pool.query('SELECT * FROM ticket_transfer_messages WHERE transfer_id=$1',[tr.id])).rows[0];tokens[suffix]=JSON.parse(crypto.unseal(m.payload_cipher,`transfer-mail:${m.id}`)).token;
  if(suffix==='expired')await db.pool.query("UPDATE ticket_transfers SET expires_at=now()-interval '1 minute' WHERE id=$1",[tr.id]);
  if(suffix==='cancelled')await transfers.manageTransfer(tr.id,'cancel',sender);
  if(suffix==='invalid')await db.pool.query("UPDATE tickets SET status='CANCELLED' WHERE id=$1",[id]);
 }
 if(suffix==='used')await db.pool.query("UPDATE tickets SET status='USED',used_at=now() WHERE id=$1",[id]);
 if(suffix==='refunded'){await db.pool.query("UPDATE tickets SET status='CANCELLED' WHERE id=$1",[id]);await db.pool.query("INSERT INTO refunds(id,payment_id,order_id,amount_clp,status) VALUES($1,$2,$2,10000,'COMPLETED')",[randomUUID(),id]);}
}
fs.mkdirSync('.local',{recursive:true});fs.writeFileSync('.local/m11-preview.json',JSON.stringify({database:db.database,password,tokens}));await db.pool.end();
console.log('M11 synthetic preview on 127.0.0.1:3005. All external provider operations disabled.');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3005'],{env,stdio:'inherit'});
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());child.on('exit',code=>process.exit(code??0));
