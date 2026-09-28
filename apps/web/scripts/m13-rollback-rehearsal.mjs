import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import pg from 'pg';
const app=fileURLToPath(new URL('../',import.meta.url)),root=path.resolve(app,'../..');
const revision='7f34bf0aa3c2e1af6ec9447ee15315a42b24e46d';
const folder=path.join(root,'.local',`m13-rollback-${Date.now()}`);await fs.mkdir(folder,{recursive:true});
const zip=path.join(folder,'source.zip');
// Exact immutable M12 source, never change this branch/worktree or reverse schema.
execFileSync('git',['archive',`--output=${zip}`,revision,'apps/web'],{cwd:root,windowsHide:true});
const unzip=spawnSync('tar',['-xf',zip,'-C',folder],{windowsHide:true,stdio:'inherit'});assert.equal(unzip.status,0);
const oldApp=path.join(folder,'apps/web');await fs.symlink(path.join(app,'node_modules'),path.join(oldApp,'node_modules'),'junction');
// Keep the original Turbopack build mode; allow the shared dependency junction inside this workspace.
const config=path.join(oldApp,'next.config.mjs');
await fs.writeFile(config,(await fs.readFile(config,'utf8')).replace("path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')",JSON.stringify(root)));
const env={};for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','TEMP','TMP','COMSPEC','APPDATA','LOCALAPPDATA','USERPROFILE'])if(process.env[key])env[key]=process.env[key];
Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',TICKETCHILE_BUILD_DIR:'.next-astra',DATABASE_SSL:'false',APP_BASE_URL:'https://localhost:3006',NEXTAUTH_URL:'https://localhost:3006',NEXTAUTH_SECRET:'m13-local-rollback-session-not-for-deployment',TICKETCHILE_QR_SECRET:'m13-local-rollback-qr-not-for-deployment',SECURITY_DATA_KEY:Buffer.alloc(32,13).toString('base64'),MEDIA_PROVIDER:'disabled',AI_PROVIDER:'disabled',MAIL_TRANSPORT:'disabled',STRIPE_ENABLED:'false',WEBPAY_ENABLED:'false',FLOW_ENABLED:'false',STRIPE_SECRET_KEY:'sk_test_inert',RESEND_API_KEY:'re_inert'});
const report=JSON.parse(await fs.readFile(path.join(root,'docs/03-implementation/qa/m13/restore-report.json'),'utf8'));
assert.match(report.target,/^ticketchile_test_m3_\d+_\d+$/);
env.DATABASE_URL='postgresql://ticket_local@127.0.0.1:1/ticketchile_build';
const build=spawnSync(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'build'],{cwd:oldApp,env,windowsHide:true,stdio:'inherit'});assert.equal(build.status,0);
env.DATABASE_URL=`postgresql://ticket_local@127.0.0.1:55439/${report.target}`;
const db=new pg.Pool({host:'127.0.0.1',port:55439,user:'ticket_local',database:report.target});
const before=(await db.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;
const child=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3006'],{cwd:oldApp,env,windowsHide:true,stdio:'inherit'});
try{
 let ready=false;
 for(let i=0;i<100;i++){try{ready=(await fetch('http://127.0.0.1:3006/api/ready')).ok;}catch{/* starting */}if(ready)break;await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,'Previous M12 binary must read restored eleven-migration schema');
 assert.deepEqual(await (await fetch('http://127.0.0.1:3006/api/health')).json(),{alive:true});
 const page=await fetch('http://127.0.0.1:3006/eventos/m13-event');assert.equal(page.status,200);assert.match(await page.text(),/M13 synthetic rehearsal/);
 assert.equal((await fetch('http://127.0.0.1:3006/api/qr?ticketId=unowned')).status,401);
 assert.deepEqual((await db.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows,before);
 const evidence={at:new Date().toISOString(),restoredRevision:revision,buildId:(await fs.readFile(path.join(oldApp,'.next-astra/BUILD_ID'),'utf8')).trim(),database:report.target,result:'Previous immutable M12 source rebuilt, started and read restored current schema; anonymous QR denied; ledger unchanged',providers:'disabled',limitations:'Local artifact rollback only; no hosted routing switch, production migration reversal or managed restore certification'};
 await fs.writeFile(path.join(root,'docs/03-implementation/qa/m13/rollback-report.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{child.kill();await db.end();}
