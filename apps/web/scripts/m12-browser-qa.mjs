import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {browserPage} from './m5-browser.mjs';
const fixture=JSON.parse(await fs.readFile('.local/m12-preview.json','utf8'));
assert.match(fixture.database,/^ticketchile_test_m3_\d+_\d+$/);
const db=new pg.Pool({host:'127.0.0.1',port:55439,user:'ticket_local',database:fixture.database});
const page=await browserPage(),base='http://localhost:3005',folder='../../docs/03-implementation/qa/m12',rows=[],performance=[];
await fs.mkdir(folder,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression){for(let i=0;i<180;i++){if(await page.evaluate(expression))return;await pause(150);}throw Error(`Timed out: ${expression}\n${await page.evaluate('document.querySelector("main")?.innerText')}`);}
// Preserve native loading attributes; the older generic visual helper forces eager.
page.navigate=async(url,width=1440)=>{
 if(!url.startsWith(base+'/'))throw Error('Loopback preview only');
 await page.call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
 await page.call('Page.navigate',{url});await wait(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'&&!!document.querySelector('h1')`);
 await page.evaluate('document.fonts.ready.then(()=>true)');await pause(400);
};
async function click(text){await wait(`[...document.querySelectorAll('main button,main a')].some(e=>e.innerText.trim()===${JSON.stringify(text)})`);await page.evaluate(`[...document.querySelectorAll('main button,main a')].find(e=>e.innerText.trim()===${JSON.stringify(text)}).click()`);}
async function session(kind,value){await page.call('Network.setCookie',{name:kind==='admin'?'tc_admin_sess':'tc_org_sess',value,url:base,httpOnly:true,sameSite:'Lax'});}
async function file(index,name){const {root}=await page.call('DOM.getDocument');const {nodeIds}=await page.call('DOM.querySelectorAll',{nodeId:root.nodeId,selector:'input[type="file"]'});await page.call('DOM.setFileInputFiles',{nodeId:nodeIds[index],files:[path.resolve(`.local/${name}`)]});}
async function state(name,width){
 await pause(250);
 // Scroll through previews so full-page screenshots include naturally lazy images.
 const count=await page.evaluate(`document.querySelectorAll('main .org-media img').length`);
 for(let i=0;i<count;i++){await page.evaluate(`document.querySelectorAll('main .org-media img')[${i}].scrollIntoView({block:'center'})`);await wait(`document.querySelectorAll('main .org-media img')[${i}].naturalWidth>0`);}
 await page.evaluate('window.scrollTo(0,0)');await pause(100);
 const result=await page.evaluate(`({name:${JSON.stringify(name)},width:innerWidth,scroll:document.documentElement.scrollWidth,main:document.querySelectorAll('main').length,images:[...document.querySelectorAll('main img')].map(i=>({src:i.currentSrc.replace(location.origin,''),loaded:i.complete&&i.naturalWidth>0,loading:i.loading,priority:i.fetchPriority,width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height})),unlabeled:[...document.querySelectorAll('main input')].filter(e=>!e.labels?.length&&!e.getAttribute('aria-label')).length})`);
 assert.ok(result.scroll<=width+1,`${name}: overflow`);assert.equal(result.main,1);assert.equal(result.unlabeled,0);assert.ok(result.images.every(i=>i.width>0&&i.height>0),`${name}: image geometry`);
 if(name==='catalog-card')assert.ok(result.images.every(i=>i.loading==='lazy'));
 rows.push(result);if(width===390||width===1440)await page.capture(`${folder}/${name}-${width}.png`);
}
async function saved(){await wait(`document.querySelector('p[aria-live="polite"]')?.textContent.startsWith('Guardado')`);}
async function imageTab(){await wait(`[...document.querySelectorAll('main button')].some(e=>e.innerText==='03 / Imagen')`);await click('03 / Imagen');await wait(`document.querySelectorAll('input[type="file"]').length===3`);}
async function confirm(target,label){await click(label);await page.evaluate(`(()=>{const e=[...document.querySelectorAll('main input')].find(e=>e.labels?.[0]?.textContent.includes('Escribe'));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(target)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await click('Confirmar cambio');await wait(`!document.querySelector('main input')`);}
let completed=false;
try{
 await page.call('Network.enable');await page.call('DOM.enable');await page.call('Page.bringToFront');
 await page.call('Page.addScriptToEvaluateOnNewDocument',{source:`window.mediaLcp=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.mediaLcp.push({time:e.startTime,url:e.url,tag:e.element?.tagName});}).observe({type:'largest-contentful-paint',buffered:true});`});
 for(const width of [390,430,768,1024,1440]){
  // Each viewport is a separate simulated editing session in this disposable DB.
  await db.query("UPDATE security_rate_limits SET expires_at=now() WHERE bucket='media-upload'");
  await session('organizer',fixture.organizer);await page.call('Network.deleteCookies',{name:'tc_admin_sess',url:base});
  await page.navigate(base+'/organizador/eventos/nuevo',width);await click('Crear borrador →');await wait(`location.search==='?section=editor'`);const id=await page.evaluate('location.pathname.split("/").pop()');
  await imageTab();await state('create-media',width);await file(0,'m12-input.png');await wait(`document.body.innerText.includes('Imagen cargada')||document.body.innerText.includes('Imagen guardada')`);await saved();await state('poster-upload',width);
  await file(1,'m12-input.png');await saved();await wait(`document.querySelectorAll('main img[src*="/api/media/"]').length>=2`);await pause(1800);await saved();await state('hero-upload',width);
  await file(2,'m12-input.png');await pause(2200);await saved();await state('mobile-hero-upload',width);
  await file(0,'m12-invalid.png');await wait(`document.body.innerText.includes('Reintentar carga')`);await state('upload-invalid',width);
  await click('Reintentar carga');await wait(`document.body.innerText.includes('Reintentar carga')`);await state('upload-retry-invalid',width);
  await file(0,'m12-replacement.png');await pause(2200);await saved();await state('poster-replaced',width);
  await page.call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await file(1,'m12-replacement.png');await wait(`document.body.innerText.includes('Reintentar carga')`);await state('replacement-offline',width);
  await page.call('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await click('Reintentar carga');await pause(2200);await saved();await state('replacement-retry-success',width);
  const current=(await db.query('SELECT image,hero_desktop,hero_mobile FROM events WHERE id=$1',[id])).rows[0];
  await db.query('UPDATE events SET revision=revision+1 WHERE id=$1',[id]);await file(1,'m12-replacement.png');await wait(`document.body.innerText.includes('Cargar versión actual')`);await state('replacement-conflict',width);assert.equal((await db.query('SELECT hero_desktop FROM events WHERE id=$1',[id])).rows[0].hero_desktop,current.hero_desktop);
  await page.call('Page.navigate',{url:`${base}/organizador/eventos/${id}?section=editor`});await wait(`document.readyState==='complete' && !document.body.innerText.includes('Cargar versión actual')`);await imageTab();await state('replacement-recovered',width);
  await click('Quitar portada móvil');await pause(1800);await saved();await state('remove-mobile',width);
  await db.query("UPDATE events SET title=$2,description='Una experiencia de prueba local para la comunidad.',category_slug='conciertos',date_iso=now()+interval '20 days',end_at=now()+interval '20 days 3 hours',city='Santiago',region='Metropolitana',venue='Teatro Cordillera',address='Direccion de prueba',age_policy='Adultos',access_info='Acceso principal',capacity=100,revision=revision+1 WHERE id=$1",[id,`Cordillera Sonora ${width}`]);
  await db.query("INSERT INTO ticket_types(id,event_id,name,price_clp,capacity,max_per_order,visible,active) VALUES('general',$1,'General',12000,100,4,true,true)",[id]);
  await page.navigate(`${base}/organizador/eventos/${id}?section=preview`,width);await state('draft-preview',width);
  await session('admin',fixture.admin);await page.call('Network.deleteCookies',{name:'tc_org_sess',url:base});await page.navigate(`${base}/admin/events/${id}`,width);await state('admin-draft-review',width);assert.ok(await page.evaluate(`[...document.querySelectorAll('main img')].filter(i=>i.currentSrc.includes('/api/media/')).every(i=>i.naturalWidth>0)`));
  await session('organizer',fixture.organizer);await page.navigate(`${base}/organizador/eventos/${id}?section=checklist`,width);await confirm('IN_REVIEW','Revisar para publicación');await state('publication-review',width);await confirm('PUBLISHED','Publicado');await state('published',width);
  await page.call('Network.deleteCookies',{name:'tc_org_sess',url:base});await page.call('Network.deleteCookies',{name:'tc_admin_sess',url:base});
  await page.navigate(`${base}/eventos/${id}`,width);await state('public-hero',width);
  performance.push({width,...await page.evaluate(`({lcp:window.mediaLcp,images:performance.getEntriesByType('resource').filter(r=>r.initiatorType==='img').map(r=>({url:r.name.replace(location.origin,''),bytes:r.encodedBodySize,duration:r.duration})),hero:[...document.images].filter(i=>i.fetchPriority==='high').map(i=>({src:i.currentSrc,loading:i.loading}))})`)});
  await page.navigate(base+'/eventos',width);await state('catalog-card',width);
  const missing=randomUUID();await db.query("INSERT INTO media_objects(id,organizer_id,event_id,object_key,content_type,bytes) VALUES($1,'m12-organizer',$2,$3,'image/webp',100)",[missing,id,`${missing}.webp`]);await db.query('UPDATE events SET hero_desktop=$2,hero_mobile=$2 WHERE id=$1',[id,`/api/media/${missing}`]);
  await page.navigate(`${base}/eventos/${id}`,width);await wait(`[...document.images].some(i=>i.currentSrc.includes('media-placeholder.svg')&&i.naturalWidth>0)`);await state('missing-fallback',width);
  await db.query("UPDATE events SET hero_desktop=$2,hero_mobile='' WHERE id=$1",[id,current.hero_desktop]);
 }
 completed=true;console.log(`PASS ${rows.length} media states at five widths.`);
}finally{await fs.writeFile(`${folder}/browser-report.json`,JSON.stringify({completed,states:rows,performance,environment:'Local development adapter and disposable PostgreSQL. No live S3/CDN.',limitations:'Chrome emulation, not physical device or production LCP certification.'},null,2));await page.close();await db.end();}
