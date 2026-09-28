import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {localDatabase} from './local-postgres.mjs';
import {loadSource} from './load-source.mjs';
let db,owner,actor,service,events,bytes,store;
const objects=new Map(),deleted=[];
const savedKey=process.env.SECURITY_DATA_KEY;
const storage=loadSource('lib/media-storage.server.ts');
const overrides=()=>({'@/lib/db':db,'@/lib/media-storage.server':{...storage,mediaStore:()=>store},'./media-storage.server':{...storage,mediaStore:()=>store},'@/lib/security/http.server':{cookieIdentity:async kind=>actor?.kind===kind?actor:null},'./http.server':{cookieIdentity:async kind=>actor?.kind===kind?actor:null},'./current.server':{buyerPrincipal:async()=>actor?.kind==='BUYER'?actor:null}});
const load=(file,extra={})=>loadSource(file,{...overrides(),...extra});
async function event(){actor=owner;await db.pool.query("UPDATE security_rate_limits SET expires_at=now() WHERE bucket='event-create'");return (await events.createEvent(owner.id)).id;}
async function upload(eventId,extra={},target=store){return service.persistMedia({organizerId:owner.id,eventId,purpose:'POSTER',actor:owner,requestKey:randomUUID(),bytes,mime:'image/png',...extra},target);}
async function row(id){return (await db.pool.query('SELECT * FROM media_objects WHERE id=$1',[id])).rows[0];}
async function age(id){await db.pool.query("UPDATE media_objects SET orphaned_at=now()-interval '8 days',touched_at=now()-interval '8 days' WHERE id=$1",[id]);}
before(async()=>{
 process.env.SECURITY_DATA_KEY=Buffer.alloc(32,12).toString('base64');db=await localDatabase();
 await db.pool.query("INSERT INTO organizer_users(id,username,display_name,password_hash,verified,approved) VALUES('m12-owner','m12-owner','Owner','disabled',true,true),('m12-other','m12-other','Other','disabled',true,true)");
 owner=await load('lib/security/identity.server.ts').principal('ORGANIZER','m12-owner');actor=owner;
 store={provider:'local',namespace:'local/v1',identity:'local',put:async(k,b)=>{assert.ok(!objects.has(k),'immutable');objects.set(k,b);},get:async k=>{if(!objects.has(k))throw Error('missing');return objects.get(k);},head:async k=>objects.has(k)?{bytes:objects.get(k).length,checksum:storage.checksum(objects.get(k)),contentType:'image/webp'}:null,delete:async k=>{deleted.push(k);objects.delete(k);}};
 bytes=await sharp({create:{width:1600,height:900,channels:3,background:'red'}}).png().toBuffer();
 service=load('lib/media-lifecycle.server.ts');events=load('lib/organizer/events.server.ts');
});
after(async()=>{await db?.pool.end();if(savedKey===undefined)delete process.env.SECURITY_DATA_KEY;else process.env.SECURITY_DATA_KEY=savedKey;});
test('upload uses live event capability; cross-organizer and event-scoped staff cannot claim another event',async()=>{
 const id=await event(),foreign=await load('lib/security/identity.server.ts').principal('ORGANIZER','m12-other');
 await assert.rejects(upload(id,{actor:foreign}),{status:404});
 const uid=randomUUID();await db.pool.query("INSERT INTO usuarios(id,email,email_verified_at) VALUES($1,'staff@m12.test',now())",[uid]);
 await db.pool.query("INSERT INTO organizer_staff(id,organizer_id,buyer_id,role,capabilities,event_ids) VALUES($1,$2,$3,'ORGANIZER_MANAGER',ARRAY['event.edit','event.read'],ARRAY[$4])",[randomUUID(),owner.id,uid,id]);
 const staff=await load('lib/security/identity.server.ts').principal('BUYER',uid),other=await event();
 await assert.rejects(upload(other,{actor:staff}),{status:404});assert.ok((await upload(id,{actor:staff})).id);
 await db.pool.query('UPDATE organizer_staff SET revoked_at=now() WHERE buyer_id=$1',[uid]);await assert.rejects(upload(id,{actor:staff}),{status:404});
});
test('idempotent upload and concurrent retries create one asset, three immutable variants and one audit',async()=>{
 const id=await event(),requestKey=randomUUID(),results=await Promise.all([upload(id,{requestKey}),upload(id,{requestKey})]);
 assert.equal(results[0].id,results[1].id);const m=await row(results[0].id);assert.equal(m.state,'READY');assert.equal(m.purpose,'POSTER');assert.equal(m.width,1600);
 assert.equal((await db.pool.query('SELECT count(*)::int n FROM media_variants WHERE media_id=$1',[m.id])).rows[0].n,3);
 assert.equal((await db.pool.query("SELECT count(*)::int n FROM security_audit WHERE target_id=$1 AND action='media.created'",[m.id])).rows[0].n,1);
 await assert.rejects(upload(id,{requestKey,purpose:'HERO_DESKTOP'}),{code:'MEDIA_CONFLICT'});
});
test('storage failure leaves durable intent and no active broken reference; retry finishes the same keys',async()=>{
 const id=await event(),requestKey=randomUUID(),before=objects.size;
 await assert.rejects(upload(id,{requestKey},{...store,put:async()=>{throw Error('storage unavailable');}}));
 const m=(await db.pool.query('SELECT * FROM media_objects WHERE request_key=$1',[requestKey])).rows[0];assert.equal(m.state,'UPLOADING');assert.equal(m.last_error,'UPLOAD_FAILED');assert.equal(objects.size,before);
 await assert.rejects(db.pool.query('UPDATE events SET image=$1 WHERE id=$2',[`/api/media/${m.id}`,id]),{code:'23514'});
 assert.equal((await upload(id,{requestKey})).id,m.id);assert.equal((await row(m.id)).state,'READY');
});
test('DB finalization failure after storage writes remains recoverable without duplicate objects',async()=>{
 const id=await event(),requestKey=randomUUID();let fail=true;
 const broken=load('lib/media-lifecycle.server.ts',{'@/lib/security/audit.server':{audit:async()=>{if(fail)throw Error('DB audit failure');}}});
 const input={organizerId:owner.id,eventId:id,purpose:'POSTER',actor:owner,requestKey,bytes,mime:'image/png'};
 await assert.rejects(broken.persistMedia(input,store));const m=(await db.pool.query('SELECT * FROM media_objects WHERE request_key=$1',[requestKey])).rows[0];assert.equal(m.state,'UPLOADING');assert.ok(objects.has(m.object_key));
 const count=objects.size;fail=false;assert.equal((await broken.persistMedia(input,store)).id,m.id);assert.equal(objects.size,count);
});
test('failed intent DB transaction writes no objects',async()=>{
 const id=await event(),before=objects.size;
 const broken=load('lib/media-lifecycle.server.ts',{'@/lib/db':{...db,withTx:async()=>{throw Error('DB down');}}});
 await assert.rejects(broken.persistMedia({organizerId:owner.id,eventId:id,purpose:'POSTER',actor:owner,requestKey:randomUUID(),bytes,mime:'image/png'},store));assert.equal(objects.size,before);
});
test('replacement succeeds through revision save; failed DB save preserves the current asset',async()=>{
 const id=await event(),a=await upload(id),b=await upload(id);let e=await events.readEvent(id);
 await events.saveEvent(id,e.revision,{...e,image:a.url});e=await events.readEvent(id);
 const broken=load('lib/organizer/events.server.ts',{'@/lib/security/audit.server':{audit:async()=>{throw Error('audit failed');}}});
 await assert.rejects(broken.saveEvent(id,e.revision,{...e,image:b.url}));assert.equal((await events.readEvent(id)).image,a.url);assert.ok(objects.has((await row(a.id)).object_key));
 await events.saveEvent(id,e.revision,{...e,image:b.url});assert.equal((await events.readEvent(id)).image,b.url);assert.ok((await row(a.id)).orphaned_at);assert.equal((await row(b.id)).orphaned_at,null);
});
test('concurrent event replacements commit once and preserve the losing upload for safe cleanup',async()=>{
 const id=await event(),a=await upload(id),b=await upload(id),e=await events.readEvent(id);
 const outcomes=await Promise.allSettled([events.saveEvent(id,e.revision,{...e,image:a.url}),events.saveEvent(id,e.revision,{...e,image:b.url})]);
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(outcomes.find(o=>o.status==='rejected').reason.code,'REVISION_CONFLICT');
 assert.ok([a.url,b.url].includes((await events.readEvent(id)).image));assert.equal((await row(a.id)).state,'READY');assert.equal((await row(b.id)).state,'READY');
});
test('event and purpose are bound to uploads; references cannot attach another event or a hero in the poster slot',async()=>{
 const id=await event(),other=await event(),a=await upload(other),b=await upload(id,{purpose:'HERO_DESKTOP'}),e=await events.readEvent(id);
 for(const image of [a.url,b.url])await assert.rejects(events.saveEvent(id,e.revision,{...e,image}),{status:404});
});
test('cleanup retains published, draft and cancelled referenced assets, and deletes aged orphans idempotently',async()=>{
 for(const lifecycle of ['DRAFT','PUBLISHED','CANCELLED']){const id=await event(),a=await upload(id);await db.pool.query("UPDATE events SET image=$2,lifecycle=$3,is_published=($3='PUBLISHED') WHERE id=$1",[id,a.url,lifecycle]);await age(a.id);}
 const id=await event(),a=await upload(id);await age(a.id);
 const before=deleted.length,results=await service.cleanupMedia({limit:100,store});assert.ok(results.some(r=>r.id===a.id&&r.outcome==='DELETED'));assert.equal(deleted.length-before,3);assert.equal((await row(a.id)).state,'DELETED');
 assert.equal((await service.cleanupMedia({limit:100,store})).length,0);await assert.rejects(db.pool.query('UPDATE events SET image=$2 WHERE id=$1',[id,a.url]),{code:'23514'});
});
test('cleanup failure leaves a tombstone, refuses reattachment and safely retries missing objects',async()=>{
 const id=await event(),a=await upload(id);await age(a.id);let calls=0;
 const result=await service.cleanupMedia({store:{...store,delete:async k=>{if(++calls===2)throw Error('provider down');await store.delete(k);}}});assert.equal(result.find(r=>r.id===a.id).outcome,'FAILED');assert.equal((await row(a.id)).state,'DELETING');
 await assert.rejects(load('lib/media-access.server.ts').ownedMediaReference(a.url,owner.id),{status:404});assert.equal((await service.cleanupMedia({store})).length,0);
 await db.pool.query('UPDATE media_objects SET next_attempt_at=now() WHERE id=$1',[a.id]);await service.cleanupMedia({store});assert.equal((await row(a.id)).state,'DELETED');
});
test('cleanup skips locked in-flight uploads and never crosses storage identities',async()=>{
 const id=await event(),a=await upload(id);await age(a.id);const c=await db.pool.connect();
 try{await c.query('BEGIN');await c.query('SELECT id FROM media_objects WHERE id=$1 FOR UPDATE',[a.id]);const result=await service.cleanupMedia({store});assert.equal(result.find(r=>r.id===a.id).outcome,'SKIPPED');}finally{await c.query('ROLLBACK');c.release();}
 assert.equal((await service.cleanupMedia({store:{...store,identity:'other-environment'}})).length,0);assert.equal((await row(a.id)).state,'READY');await service.cleanupMedia({store});
});
test('legacy migration dry run is read-only, bounded and supports checkpoints/resume and idempotency',async()=>{
 const id=await event(),value=`data:image/png;base64,${bytes.toString('base64')}`;await db.pool.query('UPDATE events SET image=$2,hero_desktop=$2 WHERE id=$1',[id,value]);
 const worker=load('lib/media-adoption.server.ts'),before=objects.size;
 let result=await worker.adoptLegacyMedia({limit:1});assert.equal(result.results[0].outcome,'WOULD_ADOPT');assert.equal(objects.size,before);assert.equal((await db.pool.query('SELECT count(*)::int n FROM media_legacy_adoptions')).rows[0].n,0);
 result=await worker.adoptLegacyMedia({dryRun:false,limit:1,store});assert.equal(result.results[0].outcome,'APPLIED');const first=result.results[0].mediaId;
 const next=await worker.adoptLegacyMedia({dryRun:false,limit:1,cursor:result.nextCursor,store});assert.equal(next.results[0].outcome,'APPLIED');assert.equal(next.results[0].eventId,id);
 assert.equal((await worker.adoptLegacyMedia({dryRun:false,store})).results.length,0);assert.equal((await db.pool.query("SELECT original_value FROM media_legacy_adoptions WHERE media_id=$1",[first])).rows[0].original_value,value);
 await age(first);await service.cleanupMedia({store});assert.equal((await row(first)).state,'READY');
});
test('legacy migration storage failure logs safely and resumes without changing event URLs or deleting originals',async()=>{
 const id=await event(),value=`data:image/png;base64,${bytes.toString('base64')}`;await db.pool.query('UPDATE events SET image=$2 WHERE id=$1',[id,value]);const worker=load('lib/media-adoption.server.ts');
 let result=await worker.adoptLegacyMedia({dryRun:false,store:{...store,put:async()=>{throw Error('down');}}});assert.equal(result.results[0].outcome,'FAILED');assert.ok(!JSON.stringify(result).includes('base64'));
 assert.equal((await db.pool.query('SELECT image,slug FROM events WHERE id=$1',[id])).rows[0].image,value);
 result=await worker.adoptLegacyMedia({dryRun:false,store});assert.equal(result.results[0].outcome,'APPLIED');assert.equal((await db.pool.query('SELECT slug FROM events WHERE id=$1',[id])).rows[0].slug,id);
});
test('upload endpoint rejects missing purpose/key and anonymous calls before decoding',async()=>{
 const id=await event(),route=load('app/api/media/route.ts');
 const req=url=>new Request(url,{method:'POST',headers:{origin:'http://local','content-type':'image/png'},body:'invalid'});
 assert.equal((await route.POST(req(`http://local/api/media?eventId=${id}`))).status,400);
 assert.equal((await route.POST(req(`http://local/api/media?eventId=${id}&purpose=POSTER`))).status,400);
 actor=null;assert.equal((await route.POST(req(`http://local/api/media?eventId=${id}&purpose=POSTER`))).status,401);actor=owner;
});
test('draft reads need current event permission, published reads work, unpublishing withdraws access, variants are bounded',async()=>{
 const id=await event(),a=await upload(id),route=load('app/api/media/[id]/route.ts'),ctx={params:Promise.resolve({id:a.id})};
 const read=variant=>route.GET(new Request(`http://local/api/media/${a.id}${variant?`?variant=${variant}`:''}`),ctx);
 actor=owner;assert.equal((await read('thumb')).status,200);actor=null;assert.equal((await read()).status,401);
 await db.pool.query("UPDATE events SET image=$2,lifecycle='PUBLISHED',is_published=true WHERE id=$1",[id,a.url]);assert.equal((await read('card')).status,200);assert.equal((await read('../secret')).status,404);
 await db.pool.query("UPDATE events SET lifecycle='PAUSED',is_published=false WHERE id=$1",[id]);assert.equal((await read()).status,401);actor=owner;
});
test('admin media review requires persisted MFA capability and a current event reference',async()=>{
 const id=await event(),a=await upload(id),b=await upload(id);await db.pool.query('UPDATE events SET image=$2 WHERE id=$1',[id,a.url]);
 await db.pool.query("INSERT INTO admin_users(id,username,display_name,password_hash,role) VALUES('m12-admin','m12-admin','Admin','disabled','SUPERADMIN')");
 await db.pool.query("INSERT INTO identity_mfa(kind,principal_id,enabled) VALUES('ADMIN','m12-admin',true)");
 actor=await load('lib/security/identity.server.ts').principal('ADMIN','m12-admin');
 const route=load('app/api/media/[id]/route.ts'),read=asset=>route.GET(new Request('http://local'),{params:Promise.resolve({id:asset.id})});
 assert.equal((await read(a)).status,200);assert.notEqual((await read(b)).status,200);
 const detail=await load('lib/admin/queries.server.ts').adminDetail('events',id,actor);assert.equal(detail.row.image,a.url);
 await db.pool.query("UPDATE identity_mfa SET enabled=false WHERE kind='ADMIN' AND principal_id='m12-admin'");assert.notEqual((await read(a)).status,200);actor=owner;
});
test('legacy migration detects concurrent edits and keeps the original plus conflict journal',async()=>{
 const id=await event(),value=`data:image/png;base64,${bytes.toString('base64')}`;await db.pool.query('UPDATE events SET image=$2 WHERE id=$1',[id,value]);let changed=false;
 const result=await load('lib/media-adoption.server.ts').adoptLegacyMedia({dryRun:false,store:{...store,get:async k=>{if(!changed){changed=true;await db.pool.query("UPDATE events SET image='/events/noche-rock.jpg',revision=revision+1 WHERE id=$1",[id]);}return store.get(k);}}});
 assert.equal(result.results[0].outcome,'CONFLICT');const mapping=(await db.pool.query('SELECT * FROM media_legacy_adoptions WHERE event_id=$1',[id])).rows[0];assert.equal(mapping.original_value,value);assert.equal(mapping.state,'CONFLICT');assert.equal((await db.pool.query('SELECT image FROM events WHERE id=$1',[id])).rows[0].image,'/events/noche-rock.jpg');
});
test('integrity mismatch never finalizes an upload, and quotas bound pending assets',async()=>{
 const id=await event(),requestKey=randomUUID();await assert.rejects(upload(id,{requestKey},{...store,head:async()=>({bytes:1,checksum:'wrong',contentType:'image/webp'})}));
 assert.equal((await db.pool.query('SELECT state FROM media_objects WHERE request_key=$1',[requestKey])).rows[0].state,'UPLOADING');
 const previous=process.env.MEDIA_MAX_PENDING;process.env.MEDIA_MAX_PENDING='3';
 try{await assert.rejects(upload(id),{code:'MEDIA_QUOTA'});}finally{if(previous===undefined)delete process.env.MEDIA_MAX_PENDING;else process.env.MEDIA_MAX_PENDING=previous;}
});
test('S3 delivery redirects only after publication/ownership checks and never exposes draft URLs anonymously',async()=>{
 const id=await event(),a=await upload(id);let calls=0;
 const route=load('app/api/media/[id]/route.ts',{'@/lib/media-storage.server':{...storage,mediaStore:()=>({...store,readUrl:async()=>{calls++;return 'https://objects.example.test/signed-test';}})}});
 const read=()=>route.GET(new Request('http://local'),{params:Promise.resolve({id:a.id})});
 actor=null;assert.notEqual((await read()).status,302);assert.equal(calls,0);actor=owner;
 const response=await read();assert.equal(response.status,302);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('location'),'https://objects.example.test/signed-test');
});
