import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {browserPage} from './m5-browser.mjs';
const page=await browserPage(),base='http://localhost:3005',directory='../../docs/03-implementation/qa/m7',rows=[];
const {session}=JSON.parse(await fs.readFile('.local/m7-session.json','utf8'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression){for(let i=0;i<100;i++){if(await page.evaluate(expression))return;await delay(150);}throw new Error(`Timed out: ${expression}`);}
async function click(text){await page.evaluate(`(()=>{const e=Array.from(document.querySelectorAll('main button')).find(e=>e.innerText.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing button '+${JSON.stringify(text)});e.click();})()`);await delay(100);}
async function fill(label,value){await page.evaluate(`(()=>{const label=Array.from(document.querySelectorAll('main label')).find(e=>e.innerText.includes(${JSON.stringify(label)}));const e=label?.querySelector('textarea,input,select');if(!e)throw Error('Missing field');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);await delay(100);}
async function inspect(name,width){
 const result=await page.evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector('h1')?.innerText,missingLabels:Array.from(document.querySelectorAll('main input:not([type=hidden]),main select,main textarea')).filter(x=>!x.closest('label')&&!x.labels?.length&&!x.getAttribute('aria-label')).length,overflow:Array.from(document.querySelectorAll('main *')).filter(x=>x.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(x).position!=='absolute').slice(0,6).map(x=>x.tagName+'.'+x.className)})`);
 rows.push({page:name,viewport:width,...result});assert.ok(result.title);assert.ok(result.scroll<=width+1,`${name}: ${JSON.stringify(result)}`);assert.equal(result.missingLabels,0);
 if([390,1440].includes(width))await page.capture(`${directory}/${name}-${width}.png`);
}
try{
 for(const width of [390,430,768,1024,1440]){
  await page.call('Network.deleteCookies',{name:'tc_org_sess',url:base});await page.call('Network.deleteCookies',{name:'tc_ai_draft',url:base});
  await page.navigate(base+'/simulador',width);await inspect('public-empty',width);
  await fill('Describe tu evento','Concierto "Encuentro del Sur" en Santiago para 800 personas. General $15.000, VIP $30.000');
  // Delay only the browser response to inspect real in-flight UI; production code has no fake loading timer.
  await page.evaluate(`window.originalFetch=window.fetch;window.fetch=async(...args)=>{const r=await window.originalFetch(...args);if(String(args[0]).includes('/api/ai/simulator')&&args[1]?.method==='POST')await new Promise(r=>setTimeout(r,1400));return r;}`);
  await click('Generar propuesta');await wait(`document.querySelector('[aria-busy=true]')!==null`);await inspect('public-generating',width);
  await wait(`!!Array.from(document.querySelectorAll('h2')).find(e=>e.innerText==='De propuesta a borrador')`);await page.evaluate('window.fetch=window.originalFetch');await inspect('public-proposal',width);
  await fill('Nombre','Encuentro revisado');await click('Vista previa');await inspect('public-preview',width);await click('Móvil / 390');await inspect('public-mobile-preview',width);
  await click('Guardar y continuar');await click('Conservar borrador');await wait(`document.body.innerText.includes('Borrador conservado durante')`);await inspect('public-account-handoff',width);
  await page.evaluate(`window.originalFetch=window.fetch;window.fetch=async(...args)=>String(args[0]).includes('/api/ai/simulator')&&args[1]?.method==='POST'?new Response(JSON.stringify({error:'No pudimos validar la propuesta. Tu borrador sigue intacto.'}),{status:503,headers:{'Content-Type':'application/json'}}):window.originalFetch(...args)`);
  await click('Generar propuesta');await wait(`document.body.innerText.includes('No pudimos validar')`);await inspect('public-error',width);await page.evaluate('window.fetch=window.originalFetch');
  await page.call('Network.setCookie',{name:'tc_org_sess',value:session,url:base,httpOnly:true,sameSite:'Lax'});
  await page.navigate(base+'/organizador/eventos/m7-event-2?section=ai',width);await inspect('organizer-creation',width);
  await fill('Instrucciones','Concierto "Revisar nombre" en Santiago para 800 personas. General $15.000');await click('Generar propuesta');await wait(`!!document.querySelector('.ai-review')`);await inspect('organizer-review',width);
  await page.evaluate(`Array.from(document.querySelectorAll('.ai-review label')).find(e=>e.innerText.includes('Aceptar Aforo')).querySelector('input').click()`);await delay(100);await inspect('critical-confirmation',width);
  assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.innerText==='Aplicar campos seleccionados').disabled`),true);
  await click('Rechazar propuesta');await wait(`!document.querySelector('.ai-review')`);
  await fill('Tarea contextual','shorten');await click('Generar propuesta');await wait(`!!document.querySelector('.ai-review')`);await inspect('field-rewrite',width);await click('Rechazar propuesta');
  await page.navigate(base+'/organizador/eventos/m7-event-0?section=analytics',width);await click('Generar propuesta');await wait(`!!document.querySelector('.ai-review')`);await inspect('analytics',width);await click('Rechazar propuesta');
  console.log(`PASS 12 AI states at ${width}`);
 }
 await page.navigate(base+'/organizador/eventos/m7-event-2?section=ai&task=title',390);await click('Generar propuesta');await wait(`!!document.querySelector('.ai-review')`);
 await fill('Propuesto · editable','Nombre editado y aceptado');await page.evaluate(`Array.from(document.querySelectorAll('.ai-review label')).find(e=>e.innerText.includes('Aceptar Nombre')).querySelector('input').click()`);await delay(100);await click('Aplicar campos seleccionados');await wait(`document.body.innerText.includes('Campos seleccionados guardados')`);
 assert.equal(await page.evaluate(`fetch('/api/organizer/events/m7-event-2').then(r=>r.json()).then(e=>e.title)`),'Nombre editado y aceptado');await inspect('accepted-field',390);
 await page.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await page.evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`),true);
 await page.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await page.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.ok(await page.evaluate(`document.activeElement!==document.body`));
 // Claim the last anonymous browser draft after organizer authentication, via actual UI.
 await page.navigate(base+'/simulador',390);await wait(`document.body.innerText.includes('Borrador recuperado')`);await click('Guardar y continuar');
 await page.evaluate(`Array.from(document.querySelectorAll('label')).find(e=>e.innerText.includes('Revisé y confirmo')).querySelector('input').click()`);await delay(100);await click('Crear borrador en mi organización');await wait(`location.pathname.startsWith('/organizador/eventos/evt_')&&!!document.querySelector('h1')`);
 assert.ok(await page.evaluate(`document.body.innerText.includes('Encuentro revisado')`));await inspect('claimed-organizer-draft',390);
 await fs.mkdir(directory,{recursive:true});await fs.writeFile(`${directory}/responsive-report.json`,JSON.stringify(rows,null,2));console.log(`PASS ${rows.length} responsive states and single-use browser handoff.`);
}finally{await page.close();}
