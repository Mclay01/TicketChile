import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadSource} from './load-source.mjs';
import {securityHeaders} from '../security-headers.mjs';
const valid={NODE_ENV:'production',SECURITY_DATA_KEY:Buffer.alloc(32,7).toString('base64'),NEXTAUTH_SECRET:'s'.repeat(32),TICKETCHILE_QR_SECRET:'q'.repeat(32),APP_BASE_URL:'https://example.test',NEXTAUTH_URL:'https://example.test'};
test('readiness configuration rejects missing secrets, malformed keys and unsafe origins without exposing values',()=>{
 const {coreConfigurationIssues:check}=loadSource('lib/runtime-config.server.ts');
 assert.deepEqual(check(valid),[]);
 for(const key of Object.keys(valid).filter(k=>k!=='NODE_ENV')) assert.ok(check({...valid,[key]:''}).includes(key));
 for(const origin of ['http://example.test','https://user:secret@example.test','https://example.test/path','https://example.test?secret=x']) assert.ok(check({...valid,APP_BASE_URL:origin}).includes('APP_BASE_URL'));
 assert.ok(check({...valid,SECURITY_DATA_KEY:'secret'}).includes('SECURITY_DATA_KEY'));
});
test('readiness distinguishes complete ledger, missing migration and unavailable database; liveness has no database dependency',async()=>{
 const expected=fs.readdirSync('sql/migrations').filter(x=>x.endsWith('.sql')).sort();
 const mock={'@/lib/runtime-config.server':{coreConfigurationIssues:()=>[]}};
 for(const [rows,status] of [[expected,200],[expected.slice(0,-1),503],[['0001_forged.sql',...expected.slice(1)],503]]) {
  const {GET}=loadSource('app/api/ready/route.ts',{...mock,'@/lib/db':{pool:{query:async()=>({rows:rows.map(version=>({version}))})}}});
  const r=await GET();assert.equal(r.status,status);assert.deepEqual(await r.json(),{ready:status===200});assert.match(r.headers.get('cache-control'),/no-store/);
 }
 const unavailable=loadSource('app/api/ready/route.ts',{...mock,'@/lib/db':{pool:{query:async()=>{throw Error('postgres://secret:password@private');}}}});
 assert.deepEqual(await (await unavailable.GET()).json(),{ready:false});
 assert.deepEqual(await loadSource('app/api/health/route.ts').GET().json(),{alive:true});
});
test('unexpected failures expose a correlation ID and emit only closed-schema operational fields',async()=>{
 const {accessResponse}=loadSource('lib/access.server.ts');const saved=console.error,logs=[];console.error=value=>logs.push(value);
 try {const r=accessResponse(new Error('password=secret buyer@example.test ticket-123'));const body=await r.json();assert.equal(r.status,503);assert.equal(r.headers.get('x-request-id'),body.requestId);assert.match(body.requestId,/^[a-f0-9-]{36}$/);assert.equal(JSON.parse(logs[0]).requestId,body.requestId);assert.doesNotMatch(JSON.stringify([body,logs]),/password|secret|buyer@|ticket-123/);}finally{console.error=saved;}
});
test('security headers preserve self camera and Webpay form redirects, prevent framing and disable eval in production',()=>{
 const headers=Object.fromEntries(securityHeaders(true).map(h=>[h.key,h.value]));
 assert.equal(headers['Permissions-Policy'],'camera=(self), microphone=(), geolocation=()');assert.match(headers['Content-Security-Policy'],/frame-ancestors 'none'/);assert.match(headers['Content-Security-Policy'],/webpay3gint.transbank.cl/);assert.doesNotMatch(headers['Content-Security-Policy'],/unsafe-eval/);assert.ok(headers['Strict-Transport-Security']);assert.equal(securityHeaders(false).some(h=>h.key==='Strict-Transport-Security'),false);
});
test('environment template contains empty values only and covers runtime literal variables',()=>{
 const template=fs.readFileSync('../../.env.example','utf8'),keys=new Set();
 for(const line of template.split(/\r?\n/).filter(x=>x.trim()&&!x.startsWith('#'))){assert.match(line,/^[A-Z][A-Z0-9_]*=$/);keys.add(line.slice(0,-1));}
 const platform=new Set(['NODE_ENV','VERCEL_URL']);
 for(const file of fs.readdirSync('src',{recursive:true}).filter(f=>/\.tsx?$/.test(f))){const text=fs.readFileSync('src/'+file,'utf8');for(const [,key] of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g))assert.ok(keys.has(key)||platform.has(key),key);}
});
