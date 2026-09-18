import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadSource} from './load-source.mjs';
test('paid order compatibility delivery only queues valid, paid, currently owned tickets',async()=>{
 let inserts=0;
 const {deliverPaidOrder}=loadSource('lib/paid-ticket-delivery.server.ts',{
  '@/lib/buyer-guard.server':{TICKET_OWNER_SQL:'CURRENT_OWNER'},
  '@/lib/db':{pool:{query:async(sql,args)=>{
   if(sql.startsWith('SELECT')) {assert.match(sql,/CURRENT_OWNER/);assert.match(sql,/t.status='VALID'/);assert.match(sql,/p.status='PAID'/);return {rows:[{id:'ticket_1',recipient:'owner@test.invalid'}]};}
   inserts++;assert.match(sql,/ON CONFLICT DO NOTHING/);assert.deepEqual(args.slice(1),['initial:ticket_1','ticket_1','owner@test.invalid']);return {rows:[]};
  }}},
 });
 await deliverPaidOrder('order_1');assert.equal(inserts,1);
});
