import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertOrigins,assertDatabaseEnvironment,assertProviderEnvironment,assertMailRecipients,isolationIssues} from '../environment-config.mjs';
import {loadSource} from './load-source.mjs';
const preview={NODE_ENV:'production',APP_ENVIRONMENT:'preview',VERCEL_ENV:'preview',APP_BASE_URL:'https://stage-123.vercel.app',NEXTAUTH_URL:'https://stage-123.vercel.app',STAGING_ORIGIN:'https://stage-123.vercel.app',DATABASE_RESOURCE_ENVIRONMENT:'preview',DATABASE_EXPECTED_HOST:'dedicated.example.test:5432',DATABASE_EXPECTED_NAME:'ticketchile_preview_certification',DATABASE_SSL:'true'};
const uri='postgresql://fixture:synthetic@dedicated.example.test:5432/ticketchile_preview_certification';
function envRun(values,fn){const old={...process.env};Object.assign(process.env,values);try{return fn();}finally{for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}}
test('preview DB binding rejects production, alias drift, TLS disable and connection parameter overrides before network',()=>{
 assert.doesNotThrow(()=>assertDatabaseEnvironment(uri,preview));
 for(const change of [{APP_ENVIRONMENT:'production'},{DATABASE_RESOURCE_ENVIRONMENT:'production'},{DATABASE_EXPECTED_HOST:'live.example.test:5432'},{DATABASE_EXPECTED_NAME:'production'},{DATABASE_SSL:'false'},{DATABASE_SSL_REJECT_UNAUTHORIZED:'false'},{DATABASE_SSL_REJECT_UNAUTHORIZED:'0'}])assert.throws(()=>assertDatabaseEnvironment(uri,{...preview,...change}));
 for(const value of [uri.replace('dedicated','production'),uri.replace('ticketchile_preview_certification','production'),uri+'?host=production.test',uri+'?options=-c%20search_path=other'])assert.throws(()=>assertDatabaseEnvironment(value,preview));
 assert.throws(()=>assertDatabaseEnvironment(uri,{NODE_ENV:'development'}));
 assert.doesNotThrow(()=>assertDatabaseEnvironment('postgres://fixture@127.0.0.1:55439/ticketchile_test_fixture',{NODE_ENV:'test'}));
});
test('staging callbacks and authentication share an exact HTTPS origin, without production host fallback',()=>{
 assert.equal(assertOrigins(preview),preview.APP_BASE_URL);
 for(const change of [{APP_BASE_URL:'https://ticketchile.com'},{NEXTAUTH_URL:'https://different.vercel.app'},{STAGING_ORIGIN:''},{APP_BASE_URL:'https://stage-123.vercel.app/path'},{APP_BASE_URL:'http://stage-123.vercel.app'},{APP_ENVIRONMENT:'development'}])assert.throws(()=>assertOrigins({...preview,...change}));
});

test('compiled Preview identity cookies are secure, host-only and never emit the production-domain migration cookie',()=>{
 envRun(preview,()=>{
  const {setIdentityCookie}=loadSource('lib/security/http.server.ts',{'./identity.server':{}});
  const writes=[],headers=[];
  setIdentityCookie({cookies:{set:(...args)=>writes.push(args)},headers:{append:(...args)=>headers.push(args)}},'ADMIN','synthetic-token');
  assert.equal(writes[0][2].secure,true);assert.equal(writes[0][2].httpOnly,true);assert.equal(writes[0][2].sameSite,'lax');assert.equal(writes[0][2].domain,undefined);assert.equal(headers.length,0);
 });
});
test('payment callback clients reject opposite modes even if creation is disabled',()=>{
 const env={...preview,STRIPE_SECRET_KEY:'sk_test_fixture',WEBPAY_ENV:'integration',FLOW_BASE_URL:'https://sandbox.flow.cl/api',STRIPE_ENABLED:'false'};
 for(const provider of ['stripe','webpay','flow'])assert.doesNotThrow(()=>assertProviderEnvironment(provider,env));
 for(const [provider,change]of [['stripe',{STRIPE_SECRET_KEY:'sk_live_forbidden'}],['webpay',{WEBPAY_ENV:'production'}],['flow',{FLOW_BASE_URL:'https://www.flow.cl/api'}]])assert.throws(()=>assertProviderEnvironment(provider,{...env,...change}));
 const live={...env,APP_ENVIRONMENT:'production',VERCEL_ENV:'production',APP_BASE_URL:'https://ticketchile.com',NEXTAUTH_URL:'https://ticketchile.com'};
 for(const provider of ['stripe','webpay','flow'])assert.throws(()=>assertProviderEnvironment(provider,live));
});
test('opaque AI/mail/Wallet credentials require explicit resource environment; staging mail has exact recipient limits',()=>{
 for(const [provider,key] of [['openai','AI_RESOURCE_ENVIRONMENT'],['wallet','WALLET_RESOURCE_ENVIRONMENT'],['resend','MAIL_RESOURCE_ENVIRONMENT']]){
  assert.throws(()=>assertProviderEnvironment(provider,preview));
  assert.doesNotThrow(()=>assertProviderEnvironment(provider,{...preview,[key]:'preview',MAIL_ALLOWED_RECIPIENTS:'tester@example.test'}));
  assert.throws(()=>assertProviderEnvironment(provider,{...preview,[key]:'production'}));
 }
 const env={...preview,MAIL_RESOURCE_ENVIRONMENT:'preview',MAIL_ALLOWED_RECIPIENTS:'one@example.test,two@example.test'};
 assert.doesNotThrow(()=>assertMailRecipients(['ONE@example.test','two@example.test'],env));
 for(const recipients of [[],['real@customer.test'],['one@example.test','real@customer.test'],['Name <one@example.test>']])assert.throws(()=>assertMailRecipients(recipients,env));
 assert.throws(()=>assertMailRecipients(['one@example.test'],{...env,MAIL_ALLOWED_RECIPIENTS:'*@example.test'}));
});
test('nonproduction mail denies an unapproved recipient before the real transport and does not falsely succeed',async()=>{
 let calls=0;
 const mail=loadSource('lib/mail/transport.server.ts',{resend:{Resend:class{emails={send:async()=>{calls++;return {data:{id:'synthetic'}};}};}}});
 const old={...process.env};Object.assign(process.env,{...preview,MAIL_RESOURCE_ENVIRONMENT:'preview',MAIL_ALLOWED_RECIPIENTS:'tester@example.test',MAIL_TRANSPORT:'resend',RESEND_API_KEY:'synthetic',FROM_EMAIL:'sender@example.test',SECURITY_DATA_KEY:'synthetic'});
 try{
  await assert.rejects(mail.sendTransactionalMail({from:'sender@example.test',to:['customer@example.test'],subject:'test',html:'test'},'test'));assert.equal(calls,0);
  await mail.sendTransactionalMail({from:'sender@example.test',to:['tester@example.test'],subject:'test',html:'test'},'test');assert.equal(calls,1);
 }finally{for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}
});
test('hosted readiness rejects development placeholders without exposing their values',()=>{
 const issues=isolationIssues({...preview,NEXTAUTH_SECRET:'isolated-build-placeholder',TICKETCHILE_QR_SECRET:'q'.repeat(40),SECURITY_DATA_KEY:'synthetic'});
 assert.ok(issues.includes('NEXTAUTH_SECRET'));assert.ok(issues.includes('TICKETCHILE_QR_SECRET'));assert.doesNotMatch(JSON.stringify(issues),/placeholder|synthetic/);
 assert.ok(isolationIssues({...preview,NEXTAUTH_SECRET:'abcdefgh'}).includes('NEXTAUTH_SECRET'));
});
test('individual payment creation switches and AI switch fail closed independently of authorization',()=>{
 envRun({...preview,CHECKOUT_FEE_POLICY:'none',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'synthetic',STRIPE_ENABLED:'false',AI_PROVIDER:'disabled'},()=>{
  assert.equal(loadSource('lib/payments/config.server.ts').availability('stripe').available,false);
  assert.equal(loadSource('lib/ai/provider.server.ts').providerStatus().enabled,false);
 });
});
test('media upload kill switch prevents normalization, persistence and storage calls while storage reads remain configured',async()=>{
 const old=process.env.MEDIA_UPLOADS_ENABLED;process.env.MEDIA_UPLOADS_ENABLED='false';
 try{
  const service=loadSource('lib/media-lifecycle.server.ts',{'@/lib/db':{pool:{query:()=>assert.fail('DB write')},withTx:()=>assert.fail('DB write')}});
  await assert.rejects(service.persistMedia({requestKey:'valid-key-123456789'},{}),{code:'MEDIA_WRITES_DISABLED'});
  assert.equal(loadSource('lib/media-storage.server.ts').mediaSettings().provider,'local');
 }finally{if(old===undefined)delete process.env.MEDIA_UPLOADS_ENABLED;else process.env.MEDIA_UPLOADS_ENABLED=old;}
});

test('promotion incident switch refuses new discounts but preserves already reserved historical terms',async()=>{
 const old=process.env.PROMOTIONS_ENABLED;process.env.PROMOTIONS_ENABLED='false';
 const service=loadSource('lib/operations/promotion-pricing.server.ts');
 try{
  await assert.rejects(service.applyPromotionTx({query:async()=>({rows:[]})},'hold','event','TEST'),{code:'INVALID_PROMOTION'});
  await service.applyPromotionTx({query:async()=>({rows:[{code:'TEST'}]})},'hold','event','TEST');
 }finally{if(old===undefined)delete process.env.PROMOTIONS_ENABLED;else process.env.PROMOTIONS_ENABLED=old;}
});
