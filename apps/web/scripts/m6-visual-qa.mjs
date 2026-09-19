import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {browserPage} from './m5-browser.mjs';
const page=await browserPage(),base='http://localhost:3005',directory='../../docs/03-implementation/qa/m6',rows=[];
const {session}=JSON.parse(await fs.readFile('.local/m6-session.json','utf8'));
await page.call('Network.setCookie',{name:'tc_org_sess',value:session,url:base,httpOnly:true,sameSite:'Lax'});
const routes=[['dashboard','/organizador'],['events','/organizador/eventos'],['create','/organizador/eventos/nuevo'],...['overview','editor','tiers','sales','attendees','staff','access','analytics','settings','preview','checklist','ai','promotions'].map(s=>[s,`/organizador/eventos/m6-event-0?section=${s}`])];
async function inspect(name,width){
 const result=await page.evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector('h1')?.innerText,
 missingLabels:Array.from(document.querySelectorAll('main input:not([type=hidden]),main select,main textarea')).filter(x=>!x.closest('label')&&!x.labels?.length&&!x.getAttribute('aria-label')).length,
 brokenImages:Array.from(document.querySelectorAll('main img')).filter(x=>x.complete&&!x.naturalWidth).length,
 overflow:Array.from(document.querySelectorAll('main *')).filter(x=>x.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(x).position!=='absolute').slice(0,8).map(x=>x.tagName+'.'+x.className)})`);
 rows.push({page:name,viewport:width,...result});assert.ok(result.title,`${name}: missing title`);assert.ok(result.scroll<=width+1,`${name} ${width}: ${JSON.stringify(result)}`);assert.equal(result.missingLabels,0);assert.equal(result.brokenImages,0);
 if([390,1440].includes(width)&&['dashboard','events','editor','editor-tiers','preview','attendees','staff','access'].includes(name))await page.capture(`${directory}/${name}-${width}.png`);
}
try{
 for(const [name,route] of routes){for(const width of [390,430,768,1024,1440]){await page.navigate(base+route,width);await inspect(name,width);if(name==='editor'){for(const [index,label] of [[1,'dates'],[2,'media'],[3,'tiers'],[4,'additional']]){await page.evaluate(`document.querySelectorAll('.org-editor-tabs button')[${index}].click()`);await new Promise(r=>setTimeout(r,150));await inspect(`editor-${label}`,width);}}}console.log(`PASS ${name}: 390/430/768/1024/1440`);}
 await fs.mkdir(directory,{recursive:true});await fs.writeFile(`${directory}/responsive-report.json`,JSON.stringify(rows,null,2));
 console.log(`PASS ${rows.length} responsive states; persisted local organizer session.`);
}finally{await page.close();}
