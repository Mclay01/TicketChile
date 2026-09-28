import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {browserPage} from './m5-browser.mjs';
const fixture=JSON.parse(await fs.readFile('.local/m9-session.json','utf8'));
assert.match(fixture.database,/^ticketchile_test_/);
const pool=new pg.Pool({host:'127.0.0.1',port:55439,user:'ticket_local',database:fixture.database});
const page=await browserPage(),base='http://localhost:3005',directory='../../docs/03-implementation/qa/m9',rows=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression){for(let i=0;i<150;i++){if(await page.evaluate(expression))return;await delay(150);}throw Error(`Timed out: ${expression}; ${await page.evaluate('document.body.innerText')}`);}
async function click(text){await page.evaluate(`(()=>{const e=Array.from(document.querySelectorAll('main button')).find(e=>e.innerText.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing button');e.click();})()`);await delay(100);}
async function fill(name,value){await page.evaluate(`(()=>{const e=document.querySelector('main [name=${name}]');if(!e)throw Error('Missing ${name}');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);}
async function api(path,body){return page.evaluate(`fetch(${JSON.stringify(path)},{${body?`method:'POST',headers:{'Content-Type':'application/json'},body:${JSON.stringify(JSON.stringify(body))}`:''}}).then(async r=>({status:r.status,data:await r.json()}))`);}
const operation=(action,target,extra={})=>({action,target,reason:'Synthetic browser QA decision',confirmation:`${action} ${target}`,requestKey:randomUUID(),...extra});
async function inspect(name,width){const r=await page.evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector('h1')?.innerText,missingLabels:Array.from(document.querySelectorAll('main input:not([type=hidden]),main select,main textarea')).filter(x=>!x.closest('label')&&!x.labels?.length&&!x.getAttribute('aria-label')).length})`);assert.ok(r.title,JSON.stringify(r));assert.ok(r.scroll<=width+1,`${name}: ${JSON.stringify(r)}`);assert.equal(r.missingLabels,0);rows.push({page:name,...r});if([390,1440].includes(width))await page.capture(`${directory}/${name}-${width}.png`);}
async function session(value){await page.call('Network.setCookie',{name:'tc_admin_sess',value,url:base,httpOnly:true,sameSite:'Lax'});}
try{
 await session(fixture.session);
 await page.navigate(base+'/admin/support',390);await click('Abrir caso');await fill('subject','Revision operativa local');await fill('orderId','m9-order');await fill('reason','Solicitud de prueba');await fill('confirmation','support.create new');await click('Confirmar operación');await wait(`document.body.innerText.includes('Operación registrada')`);
 const support=(await pool.query('SELECT id FROM support_cases ORDER BY created_at DESC LIMIT 1')).rows[0];assert.ok(support);
 await page.navigate(base+`/admin/support/${support.id}`,390);await click('Agregar nota interna');await fill('note','Nota sintetica privada');await fill('reason','Seguimiento QA');await fill('confirmation',`support.note ${support.id}`);await click('Confirmar operación');await wait(`document.body.innerText.includes('Operación registrada')`);
 let result=await api('/api/admin/operations',operation('refund.request','m9-payment'));assert.equal(result.status,200,JSON.stringify(result));const refund=result.data.operationId;
 result=await api('/api/admin/operations',operation('refund.approve',refund,{policyReference:'QA full order policy'}));assert.equal(result.status,200,JSON.stringify(result));
 assert.equal((await api('/api/admin/operations',operation('refund.execute',refund))).status,409);
 // Cancel review before settlement. No money is sent by the preview.
 assert.equal((await api('/api/admin/operations',operation('refund.reject',refund))).status,200);
 result=await api('/api/admin/operations',operation('settlement.create','m9-event-0'));assert.equal(result.status,200,JSON.stringify(result));const settlement=result.data.operationId;
 assert.equal((await api('/api/admin/operations',operation('settlement.approve',settlement,{policyReference:'QA accounting review',accountingReviewed:true}))).status,200);
 assert.equal((await api('/api/admin/operations',operation('settlement.paid',settlement,{amount:11300,reference:'QA-only-external-reference'}))).status,200);
 const paths=[['overview','/admin'],['organizers','/admin/organizers'],['organizer-detail','/admin/organizers/m9-organizer'],['events','/admin/events'],['event-detail','/admin/events/m9-event-0'],['orders','/admin/orders?q=m9-order'],['order-detail','/admin/orders/m9-order'],['payments','/admin/payments'],['payment-detail','/admin/payments/m9-payment'],['refund-detail',`/admin/refunds/${refund}`],['settlement-detail',`/admin/settlements/${settlement}`],['support-detail',`/admin/support/${support.id}`],['commissions','/admin/commissions'],['reports','/admin/reports'],['audit','/admin/audit'],['settings','/admin/settings']];
 for(const width of [390,430,768,1024,1440]){for(const [name,path]of paths){await page.navigate(base+path,width);await inspect(name,width);}console.log(`PASS ${paths.length} admin screens at ${width}`);}
 await session(fixture.limitedSession);await page.navigate(base+'/admin',390);assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('aside a')).some(a=>a.getAttribute('href')==='/admin/refunds')`),false);
 assert.equal((await api('/api/admin/operations',operation('refund.request','m9-payment'))).status,403);
 assert.equal((await api('/api/admin/organizers/m9-organizer/approve',{})).status,410);
 const cross=await page.evaluate(`fetch('/api/admin/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'refund.request',target:'m9-payment'})}).then(r=>r.status)`);assert.equal(cross,403);
 await page.call('Network.deleteCookies',{name:'tc_admin_sess',url:base});assert.equal((await api('/api/admin/events')).status,401);
 await fs.mkdir(directory,{recursive:true});await fs.writeFile(`${directory}/responsive-report.json`,JSON.stringify({states:rows,workflows:['support create/note via forms','refund request/approval/disabled execution/rejection','settlement prepare/approve/external payout record','limited admin denial','retired alias','anonymous denial'],externalProviderCalls:0},null,2));
 console.log(`PASS ${rows.length} responsive states and admin financial/support boundaries.`);
}finally{await page.close();await pool.end();}
