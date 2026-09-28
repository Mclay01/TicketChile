import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
const env={...process.env};
for(const name of ['.env','.env.local','.env.production','.env.production.local']){
 try{for(const key of Object.keys(dotenv.parse(await fs.readFile(name))))env[key]='';}catch(e){if(e.code!=='ENOENT')throw e;}
}
for(const key of Object.keys(env))if(/^(MEDIA_|AWS_|VERCEL_|WALLET_|TRANSFERS_|PROMOTIONS_|STAGING_|DATABASE_|AI_|OPENAI_|STRIPE_|FLOW_|WEBPAY_|FINTOC_|RESEND_|MAIL_|CHECKOUT_|FROM_EMAIL$|GOOGLE_|AUTH_|SECURITY_|NEXTAUTH_|TRANSFER_|ORGANIZER_|ADMIN_BOOTSTRAP_|APP_|NEXT_PUBLIC_)/.test(key))env[key]='';
for(const key of ['TICKETCHILE_DB_POSTGRES_URL','TICKETCHILE_DB_POSTGRES_URL_NON_POOLING','POSTGRES_URL','POSTGRES_URL_NON_POOLING','POSTGRES_PRISMA_URL','DATABASE_URL'])env[key]='postgresql://synthetic@127.0.0.1:1/ticketchile_local_outage';
Object.assign(env,{NODE_ENV:'production',APP_ENVIRONMENT:'development',DATABASE_SSL:'false',TICKETCHILE_BUILD_DIR:'.next-astra',NEXT_TELEMETRY_DISABLED:'1',APP_BASE_URL:'https://localhost:3007',NEXTAUTH_URL:'https://localhost:3007',NEXTAUTH_SECRET:'m13-only-synthetic-failure-session-key',TICKETCHILE_QR_SECRET:'m13-only-synthetic-failure-qr-key',SECURITY_DATA_KEY:Buffer.alloc(32,13).toString('base64'),MEDIA_PROVIDER:'disabled',AI_PROVIDER:'disabled',MAIL_TRANSPORT:'disabled',CHECKOUT_FEE_POLICY:'none',STRIPE_SECRET_KEY:'sk_test_inert',RESEND_API_KEY:'re_inert'});
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3007'],{env,windowsHide:true,stdio:'inherit'});
try{
 let alive=false;for(let i=0;i<100;i++){try{alive=(await fetch('http://127.0.0.1:3007/api/health')).ok;}catch{/* starting */}if(alive)break;await new Promise(r=>setTimeout(r,250));}
 assert.ok(alive);
 const response=await fetch('http://127.0.0.1:3007/api/ready'),body=await response.text();assert.equal(response.status,503);assert.deepEqual(JSON.parse(body),{ready:false});assert.match(response.headers.get('cache-control'),/no-store/);assert.doesNotMatch(body,/postgres|synthetic|stack|password/);
 const report={at:new Date().toISOString(),buildId:(await fs.readFile('.next-astra/BUILD_ID','utf8')).trim(),liveness:200,readinessWithUnreachableLoopbackDatabase:503,body:JSON.parse(body),externalProviderCalls:0,limitation:'Actual compiled local HTTP process; not hosted HTTPS or infrastructure failover certification'};
 await fs.writeFile('../../docs/03-implementation/qa/m13/failure-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{child.kill();}
