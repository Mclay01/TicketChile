import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {localDatabase} from './local-postgres.mjs';
import {migrate} from '../scripts/migrate.mjs';

test('M10 legacy baseline data survives 0002-0009 without inventing verification or financial history',async()=>{
 const db=await localDatabase({applyMigrations:false});
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ticketchile-m10-baseline-'));
 try{
  await fs.copyFile('sql/migrations/0001_runtime_baseline.sql',path.join(directory,'0001_runtime_baseline.sql'));
  await migrate(db.pool,pathToFileURL(directory+path.sep));
  await db.pool.query(`INSERT INTO events(id,slug,title,city,venue,date_iso,description,is_published) VALUES('legacy','legacy','Legacy fixture','City','Venue',now()+interval '1 day','Synthetic baseline',true);
   INSERT INTO ticket_types(id,event_id,name,price_clp,capacity,sold) VALUES('general','legacy','General',1000,10,2);
   INSERT INTO holds(id,event_id,status,expires_at) VALUES('legacy','legacy','CONSUMED',now());
   INSERT INTO orders(id,hold_id,event_id,event_title,buyer_name,buyer_email,owner_email) VALUES('legacy','legacy','legacy','Legacy fixture','Fixture','contact@test.invalid','owner@test.invalid');
   INSERT INTO tickets(id,order_id,event_id,ticket_type_id,ticket_type_name,buyer_email,owner_email,status) VALUES('legacy-a','legacy','legacy','general','General','contact@test.invalid','owner@test.invalid','VALID'),('legacy-b','legacy','legacy','general','General','contact@test.invalid','owner@test.invalid','USED');
   INSERT INTO payments(id,hold_id,provider,provider_ref,event_id,event_title,buyer_name,buyer_email,owner_email,amount_clp,currency,status,order_id) VALUES('legacy','legacy','stripe','legacy-ref','legacy','Legacy fixture','Fixture','contact@test.invalid','owner@test.invalid',2000,'CLP','PAID','legacy');`);
  await migrate(db.pool);await migrate(db.pool);
  assert.equal((await db.pool.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n,9);
  const payment=(await db.pool.query("SELECT * FROM payments WHERE id='legacy'")).rows[0];
  assert.equal(payment.owner_email,'owner@test.invalid');assert.equal(payment.verified_at,null);assert.equal(payment.fulfillment_status,'ISSUED');
  assert.deepEqual((await db.pool.query('SELECT issuance_index FROM tickets ORDER BY id')).rows.map(r=>r.issuance_index),[1,2]);
  assert.equal((await db.pool.query('SELECT count(*)::int n FROM payment_finance_snapshots')).rows[0].n,0);
  assert.equal((await db.pool.query("SELECT lifecycle FROM events WHERE id='legacy'")).rows[0].lifecycle,'PUBLISHED');
 }finally{await db.pool.end();}
});

test('M10 empty database applies all nine immutable migrations and critical indexes exist',async()=>{
 const db=await localDatabase();try{
  assert.equal((await db.pool.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n,9);
  for(const index of ['idx_tickets_event_status','tickets_issuance_slot','payments_request_key','mail_jobs_pending'])assert.equal((await db.pool.query('SELECT to_regclass($1)::text AS name',[index])).rows[0].name,index);
 }finally{await db.pool.end();}
});
