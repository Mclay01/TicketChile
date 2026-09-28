import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import {browserPage} from './m5-browser.mjs';
const f=JSON.parse(await fs.readFile('.local/m9-session.json','utf8'));assert.match(f.database,/^ticketchile_test_/);
const pool=new pg.Pool({host:'127.0.0.1',port:55439,user:'ticket_local',database:f.database}),page=await browserPage(),base='http://localhost:3005',directory='../../docs/03-implementation/qa/m9',rows=[];
const support=(await pool.query('SELECT id FROM support_cases ORDER BY created_at DESC LIMIT 1')).rows[0].id,refund=(await pool.query('SELECT id FROM refunds ORDER BY created_at DESC LIMIT 1')).rows[0].id,settlement=(await pool.query('SELECT id FROM settlements ORDER BY created_at DESC LIMIT 1')).rows[0].id;
const paths=[['overview','/admin'],['organizers','/admin/organizers'],['organizer-detail','/admin/organizers/m9-organizer'],['events','/admin/events'],['event-detail','/admin/events/m9-event-0'],['orders','/admin/orders?q=m9-order'],['order-detail','/admin/orders/m9-order'],['payments','/admin/payments'],['payment-detail','/admin/payments/m9-payment'],['refund-detail',`/admin/refunds/${refund}`],['settlement-detail',`/admin/settlements/${settlement}`],['support-detail',`/admin/support/${support}`],['commissions','/admin/commissions'],['reports','/admin/reports'],['audit','/admin/audit'],['settings','/admin/settings']];
async function inspect(name,width){const r=await page.evaluate(`({scroll:document.documentElement.scrollWidth,width:innerWidth,title:document.querySelector('h1')?.innerText,missingLabels:Array.from(document.querySelectorAll('main input:not([type=hidden]),main select,main textarea')).filter(x=>!x.closest('label')&&!x.labels?.length&&!x.getAttribute('aria-label')).length})`);assert.ok(r.title);assert.ok(r.scroll<=width+1,`${name}: ${JSON.stringify(r)}`);assert.equal(r.missingLabels,0);rows.push({page:name,...r});if([390,1440].includes(width))await page.capture(`${directory}/${name}-${width}.png`);}
try{
 await page.call('Network.setCookie',{name:'tc_admin_sess',value:f.session,url:base,httpOnly:true,sameSite:'Lax'});
 for(const width of [390,430,768,1024,1440]){
  for(const [name,path] of paths){await page.navigate(base+path,width);await inspect(name,width);}
  for(const [name,path,label] of [['commission-confirmation','/admin/commissions','Programar comisión'],['moderation-confirmation','/admin/events/m9-event-0','Moderar evento'],['organizer-confirmation','/admin/organizers/m9-organizer','Decidir verificación']]){
   await page.navigate(base+path,width);await page.evaluate(`Array.from(document.querySelectorAll('main button')).find(e=>e.innerText===${JSON.stringify(label)}).click()`);assert.equal(await page.evaluate(`document.querySelector('main .admin-action form').checkValidity()`),false);await inspect(name,width);
  }
  console.log(`PASS revised layout and explicit confirmation forms at ${width}`);
 }
 await page.call('Network.setCookie',{name:'tc_admin_sess',value:f.limitedSession,url:base,httpOnly:true,sameSite:'Lax'});await page.navigate(base+'/admin/payments/m9-payment',390);assert.ok(await page.evaluate(`document.body.innerText.includes('Acceso restringido')`));await inspect('forbidden',390);
 await page.navigate(base+'/admin/orders?q=missing-order',390);assert.ok(await page.evaluate(`document.body.innerText.includes('Sin registros')`));await inspect('empty',390);
 await fs.writeFile(`${directory}/review-report.json`,JSON.stringify({states:rows,notes:'Final layout correction, native form validation and explicit permission/empty states. Read-only synthetic local data.'},null,2));console.log(`PASS ${rows.length} final review states.`);
}finally{await page.close();await pool.end();}
