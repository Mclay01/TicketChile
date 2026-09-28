import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {browserPage} from './m5-browser.mjs';
const page=await browserPage(),base='http://localhost:3005',rows=[];
async function next(){await page.evaluate(`Array.from(document.querySelectorAll('main button')).find(b=>b.innerText==='Continuar').click()`);await new Promise(r=>setTimeout(r,100));}
async function value(text){await page.evaluate(`(()=>{const e=document.querySelector('input[aria-labelledby="registration-step-title"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await new Promise(r=>setTimeout(r,100));}
try{
 for(const name of ['tc_org_sess','tc_admin_sess','next-auth.session-token'])await page.call('Network.deleteCookies',{name,url:base});
 for(const width of [390,430,768,1024,1440])for(const path of ['/organizador/login','/organizador/registro','/admin/login']){
  await page.navigate(base+path,width);
  const state=await page.evaluate(`({main:document.querySelectorAll('main').length,scroll:document.documentElement.scrollWidth,width:innerWidth,labels:[...document.querySelectorAll('main input')].filter(e=>!e.labels?.length&&!e.getAttribute('aria-labelledby')).length})`);
  assert.equal(state.main,1);assert.equal(state.labels,0);assert.ok(state.scroll<=width+1);rows.push({path,...state});
  if(width===390)await page.capture(`../../docs/03-implementation/qa/m10/auth-${path.split('/').at(-1)}-${path.includes('admin')?'admin':'organizer'}-390.png`);
 }
 await page.navigate(base+'/organizador/registro',390);await next();
 for(const text of ['QA Legal','12.345.678-5','QA Public','qa@m10.test']){assert.equal(await page.evaluate(`document.activeElement.id`),'registration-step-title');await value(text);await next();}
 await next();await next(); // email channel; optional phone skipped
 await value('short123');assert.equal(await page.evaluate(`[...document.querySelectorAll('main button')].find(b=>b.innerText==='Continuar').disabled`),true);
 await value('M10-local-password!');await next();await value('M10-local-password!');
 assert.equal(await page.evaluate(`document.querySelector('input').getAttribute('aria-labelledby')`),'registration-step-title');
 const report={states:rows,registration:'Step focus/labels and password minimum verified; no registration submitted',limitation:'No email or provider calls'};
 await fs.writeFile('../../docs/03-implementation/qa/m10/auth-report.json',JSON.stringify(report,null,2));
 const filename='../../docs/03-implementation/qa/m10/browser-report.json',full=JSON.parse(await fs.readFile(filename,'utf8'));
 for(const r of full.states.filter(r=>r.page==='organizer-register')){const verified=rows.find(v=>v.path==='/organizador/registro'&&v.width===r.width);assert.ok(verified);r.main=verified.main;r.landmarkRechecked=true;}
 await fs.writeFile(filename,JSON.stringify(full,null,2));console.log('PASS 15 auth responsive states, one main landmark, registration focus/labels/password minimum');
}finally{await page.close();}
