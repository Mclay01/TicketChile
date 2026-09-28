import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
import {browserPage} from './m5-browser.mjs';
import {loadSource} from '../tests/load-source.mjs';
const fixture=JSON.parse(await fs.readFile('.local/m11-preview.json','utf8'));
assert.match(fixture.database,/^ticketchile_test_m3_\d+_\d+$/);
const db=new pg.Pool({host:'127.0.0.1',port:55439,user:'ticket_local',database:fixture.database});
process.env.SECURITY_DATA_KEY=Buffer.alloc(32,11).toString('base64');
const crypto=loadSource('lib/security/crypto.server.ts'),page=await browserPage(),base='http://localhost:3005',rows=[];
const folder='../../docs/03-implementation/qa/m11';await fs.mkdir(folder,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression){for(let i=0;i<100;i++){if(await page.evaluate(expression))return;await pause(150);}console.error(await page.evaluate('document.querySelector("main")?.innerText'));throw Error(`Timed out: ${expression}`);}
async function fill(name,value){await page.evaluate(`(()=>{const e=document.querySelector('input[name="${name}"]');if(!e)throw Error('Missing field ${name}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function click(text){await page.evaluate(`[...document.querySelectorAll('main button,main a')].find(e=>e.innerText.trim()===${JSON.stringify(text)}).click()`);}
async function state(name,width){
 await pause(250);
 const result=await page.evaluate(`({h1:document.querySelector('h1')?.innerText,main:document.querySelectorAll('main').length,width:innerWidth,scroll:document.documentElement.scrollWidth,unlabeled:[...document.querySelectorAll('main input')].filter(e=>!e.labels?.length&&!e.getAttribute('aria-labelledby')).length,smallTargets:[...document.querySelectorAll('main button,main input,main .btn')].filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.height<43}).map(e=>e.innerText||e.name),qr:[...document.images].filter(i=>i.src.includes('/api/qr')).length})`);
 assert.equal(result.main,1,`${name} landmarks`);assert.equal(result.unlabeled,0,`${name} labels`);assert.ok(result.scroll<=width+1,`${name} overflow ${result.scroll}/${width}`);assert.equal(result.smallTargets.length,0,`${name} targets`);
 rows.push({name,...result});if(width===390||width===1440)await page.capture(`${folder}/${name}-${width}.png`);
}
async function logout(){await page.navigate(base+'/cuenta/seguridad',390);await click('Cerrar sesión');await wait(`location.pathname==='/'`);}
async function login(email,width,callback='/mis-tickets'){
 await page.navigate(`${base}/signin?callbackUrl=${callback}`,width);await fill('email',email);await fill('password',fixture.password);await page.evaluate(`document.querySelector('main form').requestSubmit()`);await wait(`location.pathname===${JSON.stringify(callback)}`);
}
async function tokenFor(id){const m=(await db.query("SELECT m.* FROM ticket_transfer_messages m JOIN ticket_transfers tr ON tr.id=m.transfer_id WHERE tr.ticket_id=$1 AND m.kind='INVITATION' ORDER BY tr.created_at DESC,m.revision DESC LIMIT 1",[id])).rows[0];return JSON.parse(crypto.unseal(m.payload_cipher,`transfer-mail:${m.id}`)).token;}
async function verification(email){const messages=await db.query("SELECT * FROM security_outbox WHERE purpose='VERIFY' ORDER BY created_at DESC LIMIT 20");for(const m of messages.rows){const p=JSON.parse(crypto.unseal(m.payload_cipher,`mail:${m.id}`));if(p.to===email)return p.token;}throw Error('Verification not queued');}
let completed=false;
try{
 await page.call('Network.enable');await page.call('Page.bringToFront');await page.call('Emulation.setFocusEmulationEnabled',{enabled:true});
 for(const name of ['next-auth.session-token','__Secure-next-auth.session-token'])await page.call('Network.deleteCookies',{name,url:base});
 for(const width of [390,430,768,1024,1440]){
  const id=`m11-${width}`,email=`new-${width}@m11.test`;
  await login('sender@m11.test',width);
  await page.navigate(base+'/cuenta',width);await state('profile-edit',width);await fill('phone','invalid');await click('Guardar cambios');await wait(`document.body.innerText.includes('Revisa el nombre')`);await state('profile-validation',width);await fill('name',`Persona de prueba ${width}`);await fill('phone','+56 9 1234 5678');await click('Guardar cambios');await wait(`document.body.innerText.includes('Tus datos fueron guardados.')`);await state('profile-success',width);
  const denial=await page.evaluate(`fetch('/api/account/profile',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Attempt',phone:'',email:'foreign@test.invalid'})}).then(async r=>({status:r.status,body:await r.json()}))`);assert.equal(denial.status,400);
  await page.navigate(base+'/cuenta/seguridad',width);await state('buyer-security',width);assert.equal(await page.evaluate(`!!document.querySelector('select')`),false);
  await page.navigate(base+'/mis-tickets',width);await state('my-tickets-normal',width);
  await page.navigate(`${base}/mis-tickets/${id}`,width);await state('transfer-start',width);await fill('recipient',email);await click('Enviar invitación');await wait(`document.body.innerText.includes('Transferencia pendiente')`);await state('transfer-pending',width);
  const oldToken=await tokenFor(id);await click('Reenviar invitación');await wait(`document.body.innerText.includes('Nueva invitación en cola')`);assert.notEqual(await tokenFor(id),oldToken);
  await click('Cancelar transferencia');await wait(`document.body.innerText.includes('Invitación cancelada.')`);await state('sender-cancelled',width);
  await fill('recipient',email);await click('Enviar invitación');await wait(`document.body.innerText.includes('Transferencia pendiente')`);const token=await tokenFor(id);
  await logout();await page.navigate(`${base}/transferir#${token}`,width);await wait(`document.body.innerText.includes('Ingresar para continuar')`);assert.equal(await page.evaluate('location.hash'),'');await state('invitation-signin-required',width);
  const stored=(await page.call('Network.getCookies',{urls:[base+'/api/tickets/transfer']})).cookies.find(c=>c.name==='tc_transfer_claim');assert.ok(stored?.httpOnly);assert.ok(!stored.value.includes(token));
  await page.navigate(base+'/signin?callbackUrl=/transferir',width);await state('recipient-login',width);
  await page.navigate(base+'/signup?callbackUrl=/transferir',width);await state('recipient-registration',width);await fill('email',email);await fill('password',fixture.password);await fill('confirm',fixture.password);await page.evaluate(`document.querySelector('main form').requestSubmit()`);await wait(`document.body.innerText.includes('Solicitud recibida.')`);
  await click('Verificar mi correo');await wait(`location.pathname==='/verificar'`);await fill('token',await verification(email));await click('Verificar correo');await wait(`document.body.innerText.includes('Correo verificado.')`);await state('recipient-verified',width);
  await login(email,width,'/transferir');await wait(`document.body.innerText.includes('Aceptar entrada')`);await state('accept-transfer',width);
  await page.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='Aceptar entrada').focus()`);assert.equal(await page.evaluate('document.activeElement.innerText'),'Aceptar entrada');await page.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r'});await page.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await wait(`document.body.innerText.includes('La entrada ya es tuya')`);await state('transfer-success',width);assert.equal(await page.evaluate('document.activeElement.tagName'),'H1');
  await page.navigate(`${base}/mis-tickets/${id}`,width);await state('new-owner-wallet',width);assert.ok(await page.evaluate(`!!document.querySelector('a[href*="wallet/google"]')`));
  const wallet=await page.evaluate(`fetch('/api/wallet/google/save-url?ticketId=${id}&format=json').then(async r=>({status:r.status,body:await r.json()}))`);assert.equal(wallet.status,200);assert.match(wallet.body.saveUrl,/^https:\/\/pay.google.com\/gp\/v\/save\//);
  const replay=await page.evaluate(`fetch('/api/tickets/transfer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'accept'})}).then(r=>r.json())`);assert.equal(replay.code,'ALREADY_ACCEPTED');
  await logout();await login('sender@m11.test',width);await page.navigate(`${base}/mis-tickets/${id}`,width);await state('transferred-away',width);assert.equal(await page.evaluate(`[...document.images].some(i=>i.src.includes('/api/qr'))`),false);assert.equal(await page.evaluate(`fetch('/api/qr?ticketId=${id}').then(r=>r.status)`),404);
  await page.navigate(base+'/mis-tickets?view=transferred',width);await state('transferred-history',width);
  await page.navigate(base+'/mis-tickets/m11-used',width);await state('used-ticket',width);await page.navigate(base+'/mis-tickets/m11-refunded',width);await state('refunded-ticket',width);
  await logout();await login('recipient@m11.test',width);
  for(const [name,expected]of [['expired','venció'],['cancelled','ya no está activa'],['invalid','no permite transferencias'],['wrong','correo que recibió']]){await page.navigate(`${base}/transferir#${fixture.tokens[name]}`,width);await wait(`document.body.innerText.includes(${JSON.stringify(expected)})`);await state(`${name}-invitation`,width);}
  await logout();
 }
 completed=true;console.log(`PASS ${rows.length} responsive states; real signup/verification/login, keyboard acceptance, resend/cancel, ownership/Wallet/QR boundaries at all five widths.`);
}finally{
 await fs.writeFile(`${folder}/browser-report.json`,JSON.stringify({completed,states:rows,providers:'Disabled; Wallet JWT generated locally only',limitations:'Local Chrome only; no actual email, Wallet issuer, mobile hardware or formal accessibility certification'},null,2));await page.close();await db.end();
}
