import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localDatabase} from './local-postgres.mjs';
import {loadSource} from './load-source.mjs';
test('private worker advisory lease prevents overlap, releases after failure, and reports poison batches without secrets',async()=>{
 const db=await localDatabase();let calls=0,release;const logs=[];
 const gate=new Promise(r=>{release=r;});
 const worker=loadSource('lib/workers.server.ts',{'./db':db,'./mail/jobs.server':{processMailJobs:async()=>{calls++;await gate;return {failed:1,sent:0};}},'./payments/reconcile.server':{},'./media-lifecycle.server':{},'./observability.server':{operationalLog:e=>logs.push(e)}});
 try{
  const first=worker.runWorkerBatch('mail',1);
  while(!calls)await new Promise(r=>setTimeout(r,5));
  assert.deepEqual(await worker.runWorkerBatch('mail',1),{skipped:true});assert.equal(calls,1);release();await first;
  const failing=loadSource('lib/workers.server.ts',{'./db':db,'./mail/jobs.server':{processMailJobs:async()=>{throw Error('secret@example.test');}},'./payments/reconcile.server':{},'./media-lifecycle.server':{},'./observability.server':{operationalLog:e=>logs.push(e)}});
  await assert.rejects(failing.runWorkerBatch('mail',1),/Worker batch failed/);
  await worker.runWorkerBatch('mail',1);assert.equal(calls,2);
  assert.ok(logs.some(e=>e.action==='worker.failed'));assert.ok(logs.some(e=>e.action==='worker.busy'));assert.doesNotMatch(JSON.stringify(logs),/secret@example/);
  await assert.rejects(worker.runWorkerBatch('constructor',1));await assert.rejects(worker.runWorkerBatch('mail',101));
 }finally{release();await db.pool.end();}
});
