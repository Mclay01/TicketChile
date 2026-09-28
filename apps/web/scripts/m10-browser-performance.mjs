import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import {encode} from 'next-auth/jwt';
import {browserPage} from './m5-browser.mjs';
import {loadSource} from '../tests/load-source.mjs';
const fixture=JSON.parse(await fs.readFile('.local/m10-session.json','utf8'));
assert.match(fixture.database,/^ticketchile_test_/);
const pool=new pg.Pool({host:'127.0.0.1',port:55439,user:'ticket_local',database:fixture.database});
const db={pool,withTx:async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
process.env.SECURITY_DATA_KEY=Buffer.alloc(32,53).toString('base64');
const identity=loadSource('lib/security/identity.server.ts',{'@/lib/db':db});
const principal=await identity.principal('BUYER',fixture.user),securitySid=await identity.createSession(principal,true);
const token=await encode({token:{sub:principal.id,email:principal.email,securitySid},secret:'m10-local-only-synthetic-session-secret',maxAge:3600});
const page=await browserPage(),url='http://localhost:3005';
try{
 for(const name of ['tc_org_sess','tc_admin_sess'])await page.call('Network.deleteCookies',{name,url});
 await page.call('Network.setCookie',{name:'next-auth.session-token',value:token,url,httpOnly:true,sameSite:'Lax'});
 await page.call('Network.enable');await page.call('Network.setCacheDisabled',{cacheDisabled:true});
 await page.navigate(url+'/scanner/m10-event-0',390);
 const resources=()=>page.evaluate(`performance.getEntriesByType('resource').filter(r=>r.name.includes('/_next/static/chunks/')&&r.name.endsWith('.js')).map(r=>({file:r.name.split('/').pop(),encodedBytes:r.encodedBodySize,decodedBytes:r.decodedBodySize}))`);
 const chunks=await fs.readdir('.next-astra/static/chunks');let decoder;
 for(const file of chunks.filter(f=>f.endsWith('.js'))){const b=await fs.readFile('.next-astra/static/chunks/'+file);if(b.length>100000&&b.includes(Buffer.from('decodeFromConstraints')))decoder={file,bytes:b.length};}
 assert.ok(decoder);const before=await resources();assert.equal(before.some(r=>r.file===decoder.file),false,'Large decoder must be deferred');
 await page.evaluate(`navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Synthetic denied','NotAllowedError')};Array.from(document.querySelectorAll('button')).find(b=>b.innerText==='Abrir cámara').click()`);
 for(let i=0;i<100;i++){if((await resources()).some(r=>r.file===decoder.file))break;await new Promise(r=>setTimeout(r,100));}
 const after=await resources();assert.ok(after.some(r=>r.file===decoder.file));
 await page.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 const motion=await page.evaluate(`({matches:matchMedia('(prefers-reduced-motion: reduce)').matches,transition:getComputedStyle(document.querySelector('button')).transitionDuration,scroll:getComputedStyle(document.documentElement).scrollBehavior})`);assert.equal(motion.matches,true);assert.equal(motion.transition,'0s');assert.equal(motion.scroll,'auto');
 const headers=await page.evaluate(`fetch('/api/health').then(async r=>({status:r.status,body:await r.json(),cache:r.headers.get('cache-control'),csp:r.headers.get('content-security-policy'),camera:r.headers.get('permissions-policy')}))`);assert.equal(headers.status,200);assert.match(headers.csp,/frame-ancestors 'none'/);assert.match(headers.camera,/camera=\(self\)/);
 await fs.writeFile('../../docs/03-implementation/qa/m10/browser-performance.json',JSON.stringify({environment:'Production build, disposable loopback fixture, Chrome cache disabled',decoder,initialScriptResources:before,afterCameraScriptResources:after,reducedMotion:motion,health:headers,scope:'Deferred decoder transfer and reduced-motion/header checks only; no Lighthouse/Core Web Vitals or production load claim.'},null,2));console.log(`PASS deferred decoder ${decoder.bytes} bytes, reduced motion and deployed local headers`);
}finally{await page.close();await pool.end();}
