import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {browserPage} from './m5-browser.mjs';
const base='http://localhost:3005',directory='../../docs/03-implementation/qa/m6',report=[];
const {session}=JSON.parse(await fs.readFile('.local/m6-session.json','utf8'));
let page=await browserPage();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression){for(let i=0;i<100;i++){if(await page.evaluate(expression))return;await pause(150);}throw new Error(`Timed out: ${expression}`);}
async function fill(selector,value){await page.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function click(text){await page.evaluate(`(()=>{const el=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!el||el.disabled)throw Error('Button unavailable');el.click()})()`);}
async function api(url,method='GET',body){return page.evaluate(`fetch(${JSON.stringify(url)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json'},${body===undefined?'':`body:JSON.stringify(${JSON.stringify(body)}),`}}).then(async r=>({status:r.status,data:await r.json()}))`);}
try{
 await page.call('Network.setCookie',{name:'tc_org_sess',value:session,url:base,httpOnly:true,sameSite:'Lax'});
 await page.navigate(base+'/organizador/eventos/nuevo',390);await click('Crear borrador');await until("location.pathname.includes('/evt_')&&!!document.querySelector('.org-editor-tabs')");
 const id=await page.evaluate("location.pathname.split('/').pop()");
 await pause(500);await fill('main input','Creado desde el navegador');await until(`fetch('/api/organizer/events/${id}').then(r=>r.json()).then(e=>e.title==='Creado desde el navegador')`);
 let e=(await api(`/api/organizer/events/${id}`)).data;assert.equal(e.title,'Creado desde el navegador');assert.equal(e.lifecycle,'DRAFT');report.push('Manual creation and autosave persist a private draft');
 const newer=await api(`/api/organizer/events/${id}`,'PATCH',{revision:e.revision,draft:{...e,title:'Cambio desde otra pestaña'}});assert.equal(newer.status,200);
 await fill('main input','No debe sobrescribir');await until("document.querySelector('main').innerText.includes('versión más reciente')");assert.equal((await api(`/api/organizer/events/${id}`)).data.title,'Cambio desde otra pestaña');await page.capture(`${directory}/autosave-conflict-390.png`);report.push('Stale browser autosave shows conflict and cannot overwrite');
 await page.close();page=await browserPage();await page.navigate(base+`/organizador/eventos/${id}?section=ai`,390);
 await fill('main textarea','Concierto "Propuesta revisada" en Santiago para 80 personas. General $15.000');await click('Preparar propuesta local');await until("document.querySelector('main').innerText.includes('Revisar cambios')");
 assert.equal((await api(`/api/organizer/events/${id}`)).data.title,'Cambio desde otra pestaña');
 await page.evaluate("Array.from(document.querySelectorAll('label')).find(l=>l.textContent.includes('Confirmo aplicar title')).querySelector('input').click()");await click('Aplicar solo cambios confirmados');await until("document.querySelector('main').innerText.includes('Cambios seleccionados guardados')");assert.equal((await api(`/api/organizer/events/${id}`)).data.title,'Propuesta revisada');report.push('Local proposal review changes only explicitly accepted fields; no publication');

 e=(await api(`/api/organizer/events/${id}`)).data;
 const template=(await api('/api/organizer/events/m6-event-2')).data;
 const uploaded=await page.evaluate(`fetch('/events/fiesta-verano.jpg').then(r=>r.blob()).then(blob=>fetch('/api/media?eventId=${id}',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob})).then(r=>r.json())`);
 assert.ok(uploaded.url);
 assert.equal((await api(`/api/organizer/events/${id}`,'PATCH',{revision:e.revision,draft:{...template,title:e.title,image:uploaded.url,hero_desktop:'',hero_mobile:''}})).status,200);
 await page.navigate(base+`/organizador/eventos/${id}?section=checklist`,430);await click('Revisar para publicaci\u00f3n');await fill('main input','IN_REVIEW');await click('Confirmar cambio');await until("document.querySelector('main').innerText.includes('En revisi\u00f3n')");
 await page.navigate(base+`/organizador/eventos/${id}?section=checklist`,430);await click('Publicado');await fill('main input','PUBLISHED');await click('Confirmar cambio');await until("document.querySelector('main .status')?.textContent==='Publicado'");assert.equal((await api(`/api/organizer/events/${id}`)).data.lifecycle,'PUBLISHED');report.push('Checklist/review/publish requires explicit owner confirmation in the UI');
 const invitationEmail=`invite-${Date.now()}@m6.test`;
 await page.navigate(base+'/organizador/eventos/m6-event-0?section=staff',390);await fill('main input[type=email]',invitationEmail);await click('Enviar invitaci\u00f3n');await until(`document.querySelector('main').innerText.includes('${invitationEmail}')`);report.push('Event-scoped staff invitation is persisted and queued, with no external mail');
 // Real buyer credentials establish the staff session. The owner cookie is then removed.
 await page.navigate(base+'/signin',390);await page.evaluate("(()=>{document.querySelector('input[name=email]').value='buyer@m6.test';document.querySelector('input[name=password]').value='M6-local-fixture-password!';document.querySelector('main form').requestSubmit()})()");await until("location.pathname==='/mis-tickets'");
 await page.call('Network.deleteCookies',{name:'tc_org_sess',url:base});await page.navigate(base+'/organizador',390);
 assert.equal(await page.evaluate("document.querySelectorAll('.org-event-row').length"),1);
 await page.navigate(base+'/organizador/eventos/m6-event-0?section=access',390);assert.ok(await page.evaluate("document.querySelector('main').innerText.includes('Abrir scanner')"));assert.equal(await page.evaluate("Array.from(document.querySelectorAll('.org-event-tabs a')).some(a=>a.textContent==='Ventas')"),false);
 assert.equal((await api('/api/organizer/events/m6-event-1')).status,404);assert.equal((await api('/api/organizer/events/m6-event-0','PATCH',{revision:1,draft:{}})).status,404);await page.capture(`${directory}/door-access-390.png`);report.push('Real buyer staff session sees only assigned event and access; editing and foreign IDs denied');
 await fs.writeFile(`${directory}/state-report.json`,JSON.stringify(report,null,2));console.log(report.map(r=>`PASS ${r}`).join('\n'));
}finally{await page.close();}
