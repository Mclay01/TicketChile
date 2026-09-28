import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {localDatabase} from '../tests/local-postgres.mjs';
import {loadSource} from '../tests/load-source.mjs';
const db=await localDatabase(),captured=[];
const measured={...db,pool:{query:async(sql,args)=>{if(/^\s*SELECT/i.test(sql))captured.push({sql,args});return db.pool.query(sql,args);}}};
try{
 await db.pool.query(`INSERT INTO organizer_users(id,username,password_hash,verified,approved) VALUES('perf-owner','perf-owner','disabled',true,true);
 INSERT INTO events(id,slug,title,city,venue,date_iso,description,is_published) SELECT 'perf-'||n,'perf-'||n,'Synthetic event '||n,'Santiago','Fixture',now()+interval '30 days','Synthetic performance fixture',true FROM generate_series(1,20)n;
 INSERT INTO organizer_events(event_id,organizer_id) SELECT id,'perf-owner' FROM events;
 INSERT INTO ticket_types(id,event_id,name,price_clp,capacity,sold) SELECT 'general',id,'General',1000,1000,500 FROM events;
 INSERT INTO holds(id,event_id,status,expires_at,owner_email) SELECT id,id,'CONSUMED',now(),'fixture@test.invalid' FROM events;
 INSERT INTO orders(id,hold_id,event_id,event_title,buyer_name,buyer_email,owner_email) SELECT id,id,id,title,'Fixture','fixture@test.invalid','fixture@test.invalid' FROM events;
 INSERT INTO tickets(id,order_id,event_id,ticket_type_id,ticket_type_name,buyer_email,owner_email,status,used_at) SELECT e.id||'-'||n,e.id,e.id,'general','General','fixture@test.invalid','fixture@test.invalid',CASE WHEN n%2=0 THEN 'USED' ELSE 'VALID' END,CASE WHEN n%2=0 THEN now() END FROM events e CROSS JOIN generate_series(1,500)n;
 ANALYZE;`);
 const catalog=loadSource('lib/events.server.ts',{'@/lib/db':measured});await catalog.catalogDb();assert.equal(captured.length,2,'Catalog list/count must not issue one query per card');
 const actor={kind:'ORGANIZER',id:'perf-owner',version:1};
 const scanner=loadSource('lib/scanner-read.server.ts',{'@/lib/db':measured,'@/lib/event-access.server':{requireEventAccess:async()=>({actor,event:{id:'perf-1'}})}});
 assert.equal((await scanner.eventStats('perf-1')).totals.used,250);assert.equal((await scanner.eventCheckins('perf-1')).length,20);
 captured.push({sql:"SELECT id FROM tickets WHERE event_id=$1 AND id>$2 AND security_can_event('ORGANIZER','perf-owner',1,event_id,'attendees.export') ORDER BY id LIMIT 500",args:['perf-1','']});
 const report=[];
 for(const [i,{sql,args}]of captured.entries()){
  const raw=(await db.pool.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+sql,args)).rows[0]['QUERY PLAN'][0];
  const nodes=[];function visit(n){nodes.push({type:n['Node Type'],index:n['Index Name'],rows:n['Actual Rows'],loops:n['Actual Loops']});for(const c of n.Plans||[])visit(c);}visit(raw.Plan);
  report.push({query:['catalog page (12)','catalog count','scanner statistics','recent check-ins (20)','scoped CSV batch (500)'][i],executionMs:raw['Execution Time'],planningMs:raw['Planning Time'],nodes});
 }
 await fs.mkdir('../../docs/03-implementation/qa/m10',{recursive:true});await fs.writeFile('../../docs/03-implementation/qa/m10/query-report.json',JSON.stringify({fixture:{events:20,tickets:10000},catalogQueries:2,results:report,interpretation:'Local fixture only; no production latency or load claim. Existing indexes retained; no speculative schema change.'},null,2));
 console.log(JSON.stringify(report.map(({query,executionMs})=>({query,executionMs}))));
}finally{await db.pool.end();}
