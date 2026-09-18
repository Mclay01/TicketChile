import assert from "node:assert/strict";
import {test,before,after} from "node:test";
import {randomUUID,scryptSync,randomBytes} from "node:crypto";
import {loadSource} from "./load-source.mjs";
import {localDatabase} from "./local-postgres.mjs";
import {migrate,assertLocalDatabase} from "../scripts/migrate.mjs";
let db,identity,crypto,mfa,recovery,staff,rate,holds,administration,registration,hash;
const password="Local fixture password 19!";
const inbox=[];
const delivery=async(_client,message)=>inbox.push(message);
const previousKey=process.env.SECURITY_DATA_KEY;
let cookieToken="";
const overrides=()=>({"@/lib/db":db,"@/auth":{authOptions:{}},"next-auth/next":{getServerSession:async()=>null},
  "next/headers":{cookies:async()=>({get:()=>cookieToken?{value:cookieToken}:undefined})}});
const load=entry=>loadSource(entry,overrides());
async function buyer(){
  const id=randomUUID();await db.pool.query("INSERT INTO usuarios(id,nombre,email,password_hash,email_verified_at) VALUES($1,'Fixture',$2,$3,NOW())",[id,`${id}@test.invalid`,hash]);
  return identity.principal("BUYER",id);
}
async function owner(){
  const id=`org_${randomUUID()}`;
  await db.pool.query("INSERT INTO organizer_users(id,username,email,password_hash,verified,approved) VALUES($1,$1,$2,$3,true,true)",[id,`${id}@test.invalid`,hash]);
  return identity.principal("ORGANIZER",id);
}
async function admin(role="ADMIN"){
  const id=`adm_${randomUUID()}`;
  await db.pool.query("INSERT INTO admin_users(id,username,email,email_verified_at,password_hash,role) VALUES($1,$1,$2,NOW(),$3,$4)",[id,`${id}@test.invalid`,hash,role]);
  return identity.principal("ADMIN",id);
}
async function event(org){
  const id=`event_${randomUUID()}`;
  await db.pool.query("INSERT INTO events(id,slug,title,city,venue,date_iso,description,is_published) VALUES($1,$1,'Fixture','City','Venue',NOW(),'Fixture',true)",[id]);
  await db.pool.query("INSERT INTO organizer_events(organizer_id,event_id) VALUES($1,$2)",[org.id,id]);
  await db.pool.query("INSERT INTO ticket_types(id,event_id,name,price_clp,capacity) VALUES('general',$1,'General',1000,1000)",[id]);
  return id;
}
async function can(p,eventId,cap){return (await db.pool.query("SELECT security_can_event($1,$2,$3,$4,$5) AS allowed",[p.kind,p.id,p.version,eventId,cap])).rows[0].allowed;}
async function invitation(org,p,role,eventIds){
  const result=await staff.inviteStaff(org,{organizerId:org.id,email:p.email,role,eventIds},delivery);
  return {...result,token:inbox.at(-1).token};
}
before(async()=>{
  process.env.SECURITY_DATA_KEY=Buffer.alloc(32,41).toString("base64");
  db=await localDatabase();
  crypto=load("lib/security/crypto.server.ts");hash=await crypto.hashPassword(password);
  identity=load("lib/security/identity.server.ts");mfa=load("lib/security/mfa.server.ts");recovery=load("lib/security/recovery.server.ts");
  staff=load("lib/security/staff.server.ts");rate=load("lib/security/rate-limit.server.ts");holds=load("lib/hold.pg.server.ts");
  administration=load("lib/security/administration.server.ts");registration=load("lib/security/registration.server.ts");
});
after(async()=>{await db?.pool.end();if(previousKey===undefined)delete process.env.SECURITY_DATA_KEY;else process.env.SECURITY_DATA_KEY=previousKey;});

test("migrations execute and are idempotent; checksum drift is rejected",async()=>{
  await migrate(db.pool);assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n,4);
  await db.pool.query("UPDATE schema_migrations SET checksum='changed' WHERE version='0003_capability_policy.sql'");
  await assert.rejects(migrate(db.pool),/checksum mismatch/);
  // Restore only the disposable ledger using the immutable source digest.
  const fs=await import("node:fs/promises");const sql=await fs.readFile(new URL("../sql/migrations/0003_capability_policy.sql",import.meta.url),"utf8");
  await db.pool.query("UPDATE schema_migrations SET checksum=$1 WHERE version='0003_capability_policy.sql'",[crypto.digest(sql.replace(/\r\n/g,"\n"))]);
  for(const url of ["postgres://x@remote.invalid/ticketchile_test","postgres://x@127.0.0.1/production","postgres://x@127.0.0.1/ticketchile_test?host=remote.invalid"])
    assert.throws(()=>assertLocalDatabase(url));
});
test("modern passwords and both legacy scrypt encodings verify; malformed hashes fail closed",async()=>{
  assert.equal(await crypto.verifyPassword(password,hash),true);
  assert.equal(await crypto.verifyPassword("wrong",hash),false);
  const salt=randomBytes(16),key=scryptSync(password,salt,64);
  for(const encoding of ["hex","base64url"]){
    const legacy=`scrypt$${salt.toString(encoding)}$${key.toString(encoding)}`;
    assert.equal(await crypto.verifyPassword(password,legacy),true);
    const p=await buyer();await db.pool.query("UPDATE usuarios SET password_hash=$2 WHERE id=$1",[p.id,legacy]);
    assert.ok(await identity.authenticate("BUYER",p.email,password));
    assert.match((await identity.principal("BUYER",p.id)).password_hash,/^scrypt-v2\$/);
  }
  for(const malformed of ["","plaintext","scrypt$x$x","scrypt-v2$999999999$8$1$x$x"])assert.equal(await crypto.verifyPassword(password,malformed),false);
});
test("opaque sessions are hashed, expire, revoke, reject disabled users and separate MFA setup",async()=>{
  const p=await buyer(),sid=await identity.createSession(p);
  assert.equal((await identity.readSession(sid,"BUYER")).id,p.id);
  assert.equal(await identity.readSession(sid,"ADMIN"),null);
  const stored=(await db.pool.query("SELECT token_hash FROM identity_sessions WHERE principal_id=$1",[p.id])).rows[0];
  assert.notEqual(stored.token_hash,sid);assert.equal(stored.token_hash,crypto.digest(sid));
  await identity.revokeSession(sid);assert.equal(await identity.readSession(sid,"BUYER"),null);
  const second=await identity.createSession(p);assert.notEqual(second,sid);
  await db.pool.query("UPDATE identity_sessions SET expires_at=NOW()-interval '1 second' WHERE token_hash=$1",[crypto.digest(second)]);
  assert.equal(await identity.readSession(second,"BUYER"),null);
  const third=await identity.createSession(p);await db.pool.query("UPDATE usuarios SET is_active=false WHERE id=$1",[p.id]);
  assert.equal(await identity.readSession(third,"BUYER"),null);
  const privileged=await admin(),pending=await identity.createSession(privileged);
  assert.equal(await identity.readSession(pending,"ADMIN"),null);assert.equal((await identity.readSession(pending,"ADMIN",true)).ready,false);
});
for(const role of ["ORGANIZER_MANAGER","ORGANIZER_DOOR","ORGANIZER_FINANCE","ORGANIZER_SUPPORT"]){
  test(`${role} enforces complete least-privilege matrix, explicit event scope and tenant denial`,async()=>{
    const org=await owner(),foreign=await owner(),p=await buyer();
    const allowedEvent=await event(org),otherEvent=await event(org),foreignEvent=await event(foreign);
    const invite=await invitation(org,p,role,[allowedEvent]);await staff.acceptInvite(p,invite.token);
    const capabilities=load("lib/security/capabilities.server.ts");
    for(const cap of ["event.read","event.edit","scanner.read","scanner.checkin","attendees.read","attendees.export","finance.read","staff.manage","audit.read"]){
      assert.equal(await can(org,allowedEvent,cap),true);
      assert.equal(await can(p,allowedEvent,cap),capabilities.roleCapabilities[role].includes(cap),cap);
      assert.equal(await can(p,otherEvent,cap),false);assert.equal(await can(p,foreignEvent,cap),false);
    }
    await assert.rejects(staff.inviteStaff(p,{organizerId:org.id,email:"attack@test.invalid",role:"ORGANIZER_DOOR"},delivery),e=>e.status===403);
    await assert.rejects(staff.inviteStaff(org,{organizerId:foreign.id,email:p.email,role},delivery),e=>e.status===403);
  });
}
test("invites reject expiry, reuse, wrong recipient, duplicate pending and excessive capabilities",async()=>{
  const org=await owner(),p=await buyer(),wrong=await buyer();const ev=await event(org);
  const invite=await invitation(org,p,"ORGANIZER_DOOR",[ev]);
  await assert.rejects(staff.acceptInvite(wrong,invite.token),e=>e.status===400);
  await assert.rejects(invitation(org,p,"ORGANIZER_DOOR",[ev]),e=>e.status===409);
  await assert.rejects(staff.inviteStaff(org,{organizerId:org.id,email:wrong.email,role:"ORGANIZER_DOOR",capabilities:["finance.read"]},delivery),e=>e.status===400);
  await db.pool.query("UPDATE organizer_invites SET expires_at=NOW()-interval '1 second' WHERE id=$1",[invite.id]);
  await assert.rejects(staff.acceptInvite(p,invite.token),e=>e.status===400);
  const replacement=await invitation(org,p,"ORGANIZER_DOOR",[ev]);await staff.acceptInvite(p,replacement.token);
  await assert.rejects(staff.acceptInvite(p,replacement.token),e=>e.status===400);
  const membership=(await db.pool.query("SELECT id FROM organizer_staff WHERE buyer_id=$1",[p.id])).rows[0];
  assert.equal(await can(p,ev,"scanner.checkin"),true);
  await staff.revokeStaff(org,org.id,membership.id);
  assert.equal(await can(p,ev,"scanner.checkin"),false);
  const revoked=await invitation(org,wrong,"ORGANIZER_DOOR",[ev]);await staff.revokeStaff(org,org.id,revoked.id,true);
  await assert.rejects(staff.acceptInvite(wrong,revoked.token),e=>e.status===400);
});
for(const kind of ["BUYER","ORGANIZER","ADMIN"]){
  test(`${kind} recovery is nonenumerating, expires, single-use and revokes sessions`,async()=>{
    const p=await (kind==="BUYER"?buyer():kind==="ORGANIZER"?owner():admin());
    const sid=await identity.createSession(p,true);
    const before=inbox.length;
    const existing=await recovery.requestRecovery(kind,p.login,delivery);
    assert.deepEqual(await recovery.requestRecovery(kind,"does-not-exist",delivery),existing);
    assert.equal(inbox.length,before+1);const first=inbox.at(-1).token;
    await recovery.requestRecovery(kind,p.login,delivery);assert.equal(inbox.at(-1).token,first);
    await db.pool.query("UPDATE identity_tokens SET expires_at=NOW()-interval '1 second' WHERE token_hash=$1",[crypto.digest(first)]);
    await assert.rejects(recovery.resetPassword(kind,first,password),e=>e.status===400);
    await recovery.requestRecovery(kind,p.login,delivery);const token=inbox.at(-1).token;
    const results=await Promise.allSettled([recovery.resetPassword(kind,token,password+"new"),recovery.resetPassword(kind,token,password+"new")]);
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    assert.equal(await identity.readSession(sid,kind,true),null);
    assert.ok(await identity.authenticate(kind,p.login,password+"new"));
    await assert.rejects(identity.createSession(p,true),e=>e.status===401);
    await assert.rejects(recovery.resetPassword(kind,token,password),e=>e.status===400);
  });
}
test("TOTP matches RFC6238 vector, confirmation rejects wrong codes; replay and recovery reuse fail",async()=>{
  const vector=crypto.base32(Buffer.from("12345678901234567890"));assert.equal(crypto.totp(vector,1,8),"94287082");
  const p=await admin();const pending=await identity.createSession(p);
  const enrollment=await mfa.beginEnrollment(p,password);
  await assert.rejects(mfa.confirmEnrollment(p,"invalid"),e=>e.status===401);
  const counter=Math.floor(Date.now()/30000),code=crypto.totp(enrollment.secret,counter);
  const result=await mfa.confirmEnrollment(p,code);assert.equal(result.recoveryCodes.length,10);
  assert.equal(await identity.readSession(pending,"ADMIN",true),null);
  const fresh=await identity.principal("ADMIN",p.id);assert.equal(fresh.mfa_enabled,true);
  await assert.rejects(mfa.verifyMfa(fresh,code),e=>e.status===401);
  const races=await Promise.allSettled([mfa.verifyMfa(fresh,result.recoveryCodes[0]),mfa.verifyMfa(fresh,result.recoveryCodes[0])]);
  assert.equal(races.filter(r=>r.status==="fulfilled").length,1);
  await mfa.verifyMfa(fresh,crypto.totp(enrollment.secret,counter+1));
  await assert.rejects(mfa.verifyMfa(fresh,crypto.totp(enrollment.secret,counter+1)),e=>e.status===401);
  const sid=await identity.createSession(fresh,true);
  await assert.rejects(mfa.disableMfa(fresh,"wrong",result.recoveryCodes[1]),e=>e.status===401);
  await mfa.disableMfa(fresh,password,result.recoveryCodes[1]);
  assert.equal(await identity.readSession(sid,"ADMIN"),null);
  const disabled=await identity.principal("ADMIN",p.id);assert.equal(disabled.mfa_required,true);
  assert.equal(await identity.readSession(await identity.createSession(disabled),"ADMIN"),null);
  const stored=(await db.pool.query("SELECT * FROM identity_mfa WHERE principal_id=$1",[p.id])).rows[0];assert.equal(stored.secret_cipher,null);
});
test("MFA secrets are encrypted and authenticated to their account; password reset cannot remove MFA",async()=>{
  const p=await buyer(),enrollment=await mfa.beginEnrollment(p,password);
  await mfa.confirmEnrollment(p,crypto.totp(enrollment.secret,Math.floor(Date.now()/30000)));
  const stored=(await db.pool.query("SELECT * FROM identity_mfa WHERE principal_id=$1",[p.id])).rows[0];
  assert.ok(!stored.secret_cipher.includes(enrollment.secret));assert.throws(()=>crypto.unseal(stored.secret_cipher,"mfa:other"));
  await recovery.requestRecovery("BUYER",p.email,delivery);await recovery.resetPassword("BUYER",inbox.at(-1).token,password+"new");
  assert.equal((await identity.principal("BUYER",p.id)).mfa_enabled,true);
});
test("Postgres rate counters are atomic across concurrent consumers and reset after expiry",async()=>{
  const subject=randomUUID();const results=await Promise.all(Array.from({length:12},()=>rate.postgresRateStore.consume("test",subject,{hits:5,seconds:60})));
  assert.equal(results.filter(Boolean).length,5);
  await db.pool.query("UPDATE security_rate_limits SET expires_at=NOW()-interval '1 second' WHERE bucket='test'");
  assert.equal(await rate.postgresRateStore.consume("test",subject,{hits:5,seconds:60}),true);
  let now=0;const store=rate.memoryRateStore(()=>now);
  await rate.limit("x","a",{hits:1,seconds:1},store);await assert.rejects(rate.limit("x","a",{hits:1,seconds:1},store),e=>e.status===429);
  now=1001;await rate.limit("x","a",{hits:1,seconds:1},store);
});
test("hold quotas serialize concurrent creation, cap inventory, bind owners and ignore expired holds",async()=>{
  const org=await owner(),ev=await event(org),p=await buyer();
  const input={eventId:ev,ownerEmail:p.email,requested:[{ticketTypeId:"general",qty:5}]};
  const results=await Promise.allSettled(Array.from({length:4},()=>holds.createHoldPgServer(input)));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,3);
  const held=results.find(r=>r.status==="fulfilled").value.hold;
  assert.ok(new Date(held.expiresAtISO)-new Date(held.createdAtISO)<=480000);
  const guard=load("lib/security/holds.server.ts");
  await assert.rejects(db.withTx(c=>guard.requireHoldOwner(c,held.id,"foreign@test.invalid")),e=>e.status===404);
  await assert.rejects(holds.createHoldPgServer({...input,ownerEmail:"",requested:[{ticketTypeId:"general",qty:1}]}),e=>e.status===401);
  await assert.rejects(holds.createHoldPgServer({...input,requested:[{ticketTypeId:"general",qty:11}]}),e=>e.status===400);
  await db.pool.query("UPDATE holds SET expires_at=NOW()-interval '1 second' WHERE owner_email=$1",[p.email]);
  await holds.createHoldPgServer(input);
  assert.equal((await db.pool.query("SELECT held FROM ticket_types WHERE event_id=$1",[ev])).rows[0].held,5);
});
test("superadmin role removal invalidates old sessions and durable audit forbids editing",async()=>{
  const superadmin=await admin("SUPERADMIN"),target=await admin("SUPERADMIN"),normal=await admin();
  const sid=await identity.createSession(target,true);
  await assert.rejects(administration.changeIdentity(normal,"ADMIN",target.id,{role:"ADMIN"}),e=>e.status===403);
  await administration.changeIdentity(superadmin,"ADMIN",target.id,{role:"ADMIN"});
  assert.equal(await identity.readSession(sid,"ADMIN"),null);
  await assert.rejects(administration.changeIdentity(target,"BUYER",(await buyer()).id,{disabled:true}),e=>e.status===403);
  const audit=(await db.pool.query("SELECT * FROM security_audit WHERE target_id=$1 AND action='identity.permissions_changed'",[target.id])).rows[0];
  assert.equal(audit.actor_id,superadmin.id);assert.equal(audit.metadata.role,"ADMIN");
  await assert.rejects(db.pool.query("UPDATE security_audit SET action='fake' WHERE id=$1",[audit.id]),/append-only/);
  await assert.rejects(db.pool.query("DELETE FROM security_audit WHERE id=$1",[audit.id]),/append-only/);
});
test("registration and email verification use expiring hashed one-time tokens and an encrypted outbox",async()=>{
  const email=`${randomUUID()}@test.invalid`;
  await registration.register("BUYER",{email,password,name:"Fixture"},delivery);
  const token=inbox.at(-1).token;
  const p=await identity.findIdentity("BUYER",email);assert.equal(p.verified,false);
  assert.equal(await identity.authenticate("BUYER",email,password),null);
  await registration.verifyEmail("BUYER",token);await assert.rejects(registration.verifyEmail("BUYER",token),e=>e.status===400);
  assert.ok(await identity.authenticate("BUYER",email,password));
  const queue=load("lib/security/delivery.server.ts");
  await db.withTx(c=>queue.queueSecurityMessage(c,{purpose:"RESET",to:email,kind:"BUYER",token,expiresAt:new Date(Date.now()+60000).toISOString()}));
  const row=(await db.pool.query("SELECT * FROM security_outbox ORDER BY created_at DESC LIMIT 1")).rows[0];
  assert.ok(!row.payload_cipher.includes(token));assert.equal(JSON.parse(crypto.unseal(row.payload_cipher,`mail:${row.id}`)).token,token);
});
test("real scanner mutation is scoped, concurrent single-use and audited atomically",async()=>{
  const org=await owner(),ev=await event(org),p=await buyer();
  const invitationResult=await invitation(org,p,"ORGANIZER_DOOR",[ev]);await staff.acceptInvite(p,invitationResult.token);
  const hold=await holds.createHoldPgServer({eventId:ev,ownerEmail:p.email,requested:[{ticketTypeId:"general",qty:1}]});
  const order=`order_${randomUUID()}`,ticket=`ticket_${randomUUID()}`;
  await db.pool.query("INSERT INTO orders(id,hold_id,event_id,event_title,buyer_name,buyer_email,owner_email) VALUES($1,$2,$3,'Fixture','Fixture',$4,$4)",[order,hold.hold.id,ev,p.email]);
  await db.pool.query("INSERT INTO tickets(id,order_id,event_id,ticket_type_id,ticket_type_name,buyer_email,owner_email,status) VALUES($1,$2,$3,'general','General',$4,$4,'VALID')",[ticket,order,ev,p.email]);
  const route=loadSource("app/api/scanner/checkin/route.ts",{...overrides(),"@/lib/security/capabilities.server":{organizerActor:async()=>p}});
  const req=()=>new Request("http://localhost/api/scanner/checkin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({eventId:ev,ticketId:ticket})});
  const responses=await Promise.all([route.POST(req()),route.POST(req())]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM security_audit WHERE target_id=$1 AND action='ticket.checked_in'",[ticket])).rows[0].n,1);
  await db.pool.query("UPDATE organizer_staff SET revoked_at=NOW() WHERE buyer_id=$1",[p.id]);assert.equal((await route.POST(req())).status,404);
  cookieToken="";
});

test("migration runner refuses unbaselined existing data and rolls back a failed migration",async()=>{
  const local=await localDatabase({applyMigrations:false});
  try{
    await local.pool.query("CREATE TABLE existing_data(id integer PRIMARY KEY); INSERT INTO existing_data VALUES(1)");
    await assert.rejects(migrate(local.pool),/Existing schema/);
    assert.equal((await local.pool.query("SELECT id FROM existing_data")).rows[0].id,1);
  }finally{await local.pool.end();}
  const fs=await import("node:fs/promises"),os=await import("node:os"),path=await import("node:path"),url=await import("node:url");
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),"ticketchile-migration-test-"));
  const source=new URL("../sql/migrations/",import.meta.url);
  for(const file of ["0001_runtime_baseline.sql","0002_identity_security.sql","0003_capability_policy.sql","0004_payment_lifecycle.sql"])
    await fs.copyFile(new URL(file,source),path.join(directory,file));
  await fs.writeFile(path.join(directory,"0005_failure.sql"),"CREATE TABLE should_rollback(id int); SELECT intentionally_missing_function();");
  await assert.rejects(migrate(db.pool,url.pathToFileURL(directory+path.sep)),/intentionally_missing_function/);
  assert.equal((await db.pool.query("SELECT to_regclass('public.should_rollback') AS relation")).rows[0].relation,null);
  assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n,4);
});
test("privileged HTTP login grants only setup access until MFA confirmation and sets host-only cookies",async()=>{
  const p=await admin();const login=load("lib/security/login.server.ts");
  const req=()=>new Request("https://ticketchile.test/api/admin/login",{method:"POST",headers:{"content-type":"application/json",origin:"https://ticketchile.test"},body:JSON.stringify({username:p.login,password,from:"//attacker.invalid"})});
  const previousEnv=process.env.NODE_ENV;process.env.NODE_ENV="production";
  let response;
  try{response=await login.privilegedLogin(req(),"ADMIN");}finally{if(previousEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousEnv;}
  assert.equal(response.status,200);
  const payload=await response.json();assert.equal(payload.next,"/security?kind=ADMIN");assert.equal(payload.mfaSetupRequired,true);
  const cookies=response.headers.getSetCookie();
  assert.ok(cookies.some(value=>value.startsWith("tc_admin_sess=")&&value.includes("HttpOnly")&&value.includes("Secure")&&!value.includes("Domain=")));
  assert.ok(cookies.some(value=>value.includes("Domain=.ticketchile.com")&&value.includes("Max-Age=0")));
  cookieToken=response.cookies.get("tc_admin_sess").value;
  assert.equal(await identity.readSession(cookieToken,"ADMIN"),null);
  const security=load("app/api/security/[operation]/route.ts");
  const call=body=>security.POST(new Request("https://ticketchile.test/api/security/mfa",{method:"POST",headers:{"content-type":"application/json",origin:"https://ticketchile.test"},body:JSON.stringify({kind:"ADMIN",...body})}),{params:Promise.resolve({operation:"mfa"})});
  const begin=await call({action:"begin",password});assert.equal(begin.status,200);const {secret}=await begin.json();
  const confirm=await call({action:"confirm",code:crypto.totp(secret,Math.floor(Date.now()/30000))});assert.equal(confirm.status,200);
  const sid=confirm.cookies.get("tc_admin_sess").value;assert.notEqual(sid,cookieToken);
  assert.equal((await identity.readSession(sid,"ADMIN")).mfaVerified,true);
  assert.equal(await identity.readSession(cookieToken,"ADMIN",true),null);cookieToken="";
});
test("security HTTP operations reject anonymous MFA/invitations and cross-origin recovery; limits return 429",async()=>{
  cookieToken="";const route=load("app/api/security/[operation]/route.ts");
  const call=(operation,body,origin="https://ticketchile.test")=>route.POST(new Request(`https://ticketchile.test/api/security/${operation}`,{method:"POST",headers:{"content-type":"application/json",origin},body:JSON.stringify(body)}),{params:Promise.resolve({operation})});
  for(const operation of ["mfa","invite","invite-accept","staff-revoke"])assert.equal((await call(operation,{kind:"ADMIN",action:"begin"})).status,401);
  assert.equal((await call("recovery",{kind:"BUYER",login:"unknown@test.invalid"},"https://attacker.invalid")).status,403);
  const loginName=`${randomUUID()}@test.invalid`;
  for(let i=0;i<5;i++)assert.equal((await call("recovery",{kind:"BUYER",login:loginName})).status,200);
  assert.equal((await call("recovery",{kind:"BUYER",login:loginName})).status,429);
});
test("buyer JWT refresh does not resurrect revoked persisted sessions and OAuth cannot bypass enrolled MFA",async()=>{
  const p=await buyer(),sid=await identity.createSession(p);
  const {authOptions}=loadSource("auth.ts",{"@/lib/db":db});
  const token={securitySid:sid};
  const getSession=()=>authOptions.callbacks.session({session:{user:{email:p.email},expires:new Date(Date.now()+60000).toISOString()},token});
  assert.equal((await getSession()).user.email,p.email);
  const validated=await getSession();assert.equal(validated.user.securityVersion,p.version);
  const current=loadSource("lib/security/current.server.ts",{"@/lib/db":db,"@/auth":{authOptions:{}},"next-auth/next":{getServerSession:async()=>validated}});
  assert.equal((await current.buyerPrincipal()).id,p.id);
  await db.withTx(c=>identity.revokeAll(c,p));
  assert.equal(await current.buyerPrincipal(),null,"a version change between session validation and principal lookup must fail closed");
  await identity.revokeSession(sid);
  assert.equal((await authOptions.callbacks.jwt({token})).securitySid,sid);
  assert.equal((await getSession()).user,undefined);
  await db.pool.query("INSERT INTO identity_mfa(kind,principal_id,enabled) VALUES('BUYER',$1,true)",[p.id]);
  assert.equal(await authOptions.callbacks.signIn({account:{provider:"google"},profile:{email_verified:true},user:{email:p.email}}),false);
  assert.equal(await authOptions.callbacks.signIn({account:{provider:"google"},profile:{email_verified:false},user:{email:p.email}}),false);
});
test("legacy bootstrap/provisioning/SSO routes cannot use a header key or allowlist as identity",async()=>{
  for(const route of ["admin/bootstrap","organizador/admin/bootstrap","organizador/admin/create-user"]){
    const handler=load(`app/api/${route}/route.ts`);
    assert.equal((await handler.POST(new Request(`http://localhost/api/${route}`,{method:"POST",headers:{"x-bootstrap-key":"any","x-organizer-admin-key":"any"}}))).status,410);
  }
  const sso=load("app/api/organizador/sso/route.ts");assert.equal((await sso.GET(new Request("http://localhost/api/organizador/sso"))).status,410);
});
test("body limits reject missing-length oversized requests and invalid JSON without reflecting content",async()=>{
  const http=load("lib/security/http.server.ts");
  await assert.rejects(http.readBody(new Request("http://localhost",{method:"POST",body:"x".repeat(20000)})),e=>e.status===413);
  await assert.rejects(http.readBody(new Request("http://localhost",{method:"POST",headers:{"content-type":"application/json"},body:"secret-invalid-json"})),e=>e.status===400&&!e.message.includes("secret"));
});
test("staff permission changes are live in an existing session, scoped and audited",async()=>{
  const org=await owner(),foreign=await owner(),p=await buyer(),ev=await event(org),foreignEvent=await event(foreign);
  const invite=await invitation(org,p,"ORGANIZER_MANAGER",[ev]);await staff.acceptInvite(p,invite.token);
  const sid=await identity.createSession(p);const membership=(await db.pool.query("SELECT id FROM organizer_staff WHERE buyer_id=$1",[p.id])).rows[0];
  await assert.rejects(staff.updateStaff(p,{organizerId:org.id,id:membership.id,role:"ORGANIZER_FINANCE"}),e=>e.status===403);
  await assert.rejects(staff.updateStaff(org,{organizerId:org.id,id:membership.id,role:"ORGANIZER_FINANCE",eventIds:[foreignEvent]}),e=>e.status===403);
  await staff.updateStaff(org,{organizerId:org.id,id:membership.id,role:"ORGANIZER_FINANCE",eventIds:[ev]});
  const sameSession=await identity.readSession(sid,"BUYER");assert.ok(sameSession);
  assert.equal(await can(sameSession,ev,"scanner.checkin"),false);assert.equal(await can(sameSession,ev,"finance.read"),true);
  assert.equal((await db.pool.query("SELECT action FROM security_audit WHERE target_id=$1 ORDER BY id DESC LIMIT 1",[membership.id])).rows[0].action,"staff.permissions_changed");
});
test("email verification can be reissued after expiry without reviving a legacy short code",async()=>{
  const email=`${randomUUID()}@test.invalid`;
  await registration.register("ORGANIZER",{email,password,name:"Fixture"},delivery);const first=inbox.at(-1).token;
  const p=await identity.findIdentity("ORGANIZER",email);
  await db.pool.query("UPDATE identity_tokens SET expires_at=NOW()-interval '1 second' WHERE principal_id=$1",[p.id]);
  await assert.rejects(registration.verifyEmail("ORGANIZER","123456"),e=>e.status===400);
  const response=await registration.requestVerification("ORGANIZER",email,delivery);
  assert.deepEqual(await registration.requestVerification("ORGANIZER","unknown",delivery),response);
  assert.notEqual(inbox.at(-1).token,first);
  await registration.verifyEmail("ORGANIZER",inbox.at(-1).token);
  assert.equal((await identity.principal("ORGANIZER",p.id)).verified,true);
  assert.equal((await identity.principal("ORGANIZER",p.id)).active,false,"verification cannot approve an organizer");
});
test("disabling a tenant owner also suspends existing staff grants and pending invite acceptance",async()=>{
  const org=await owner(),p=await buyer(),other=await buyer(),ev=await event(org),superadmin=await admin("SUPERADMIN");
  const first=await invitation(org,p,"ORGANIZER_DOOR",[ev]);await staff.acceptInvite(p,first.token);
  const pending=await invitation(org,other,"ORGANIZER_DOOR",[ev]);
  await administration.changeIdentity(superadmin,"ORGANIZER",org.id,{disabled:true});
  assert.equal(await can(p,ev,"scanner.checkin"),false);
  await assert.rejects(staff.acceptInvite(other,pending.token),e=>e.status===400);
});
