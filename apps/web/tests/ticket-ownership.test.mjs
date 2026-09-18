import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSource as loadRawSource } from "./load-source.mjs";
// M1/M2 route contracts isolate rate storage; real atomic limits are covered by security.integration.
const loadSource=(entry,overrides={})=>loadRawSource(entry,{
  "@/lib/security/rate-limit.server":{limit:async()=>{},publicLimit:async()=>{}},...overrides,
});

function session(email) {
  return {
    "@/auth": { authOptions: {} },
    "next-auth/next": { getServerSession: async () => email ? { user: { email } } : null },
  };
}

for (const path of ["tickets", "demo/tickets"]) {
  test(`${path} requires login and ignores a supplied buyer email`, async () => {
    for (const email of [null, " OWNER@TEST.CL "]) {
      let queries = 0;
      const route = loadSource(`app/api/${path}/route.ts`, {
        ...session(email),
        "@/lib/db": { pool: { connect: async () => {
          assert.ok(email, "Anonymous request must not read tickets");
          return { release() {}, query: async (sql, args) => {
            queries++;
            assert.match(sql, /NULLIF\(BTRIM\(t.owner_email\)/);
            assert.deepEqual(args, ["owner@test.cl"]);
            return { rows: [{ id: "owned-ticket" }] };
          } };
        } } },
      });
      const response = await route.GET(new Request("https://ticketchile.test/api/" + path + "?email=someone-else@test.cl"));
      assert.equal(response.status, email ? 200 : 401);
      assert.equal(queries, email ? 1 : 0);
    }
  });
}

for (const scenario of ['anonymous','foreign','cancelled','owned','queue-failure']) {
 test(`resend ${scenario}: authenticated owner queues, never directly sends`,async()=>{
  let reads=0,queued=0;
  const route=loadSource('app/api/tickets/resend/route.ts',{
   ...session(scenario==='anonymous'?null:'owner@test.cl'),
   '@/lib/tickets.email':{},
   '@/lib/mail/transport.server':{},
   '@/lib/db':{pool:{query:async(sql,args)=>{
    if(sql.startsWith('INSERT INTO mail_jobs')) {
     queued++;if(scenario==='queue-failure')throw new Error('secret provider failure');return {rows:[{state:'PENDING'}]};
    }
    reads++;assert.match(sql,/t.status='VALID'/);assert.match(sql,/p.status='PAID'/);
    assert.deepEqual(args,['ticket-1','owner@test.cl']);
    return {rows:['foreign','cancelled'].includes(scenario)?[]:[{id:'ticket-1'}]};
   }}},
  });
  const response=await route.POST(new Request('https://ticketchile.test/api/tickets/resend',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticketId:'ticket-1',email:'attacker@test.cl'})}));
  assert.equal(response.status,{anonymous:401,foreign:404,cancelled:404,owned:202,'queue-failure':503}[scenario]);
  assert.equal(reads,scenario==='anonymous'?0:1);assert.equal(queued,['owned','queue-failure'].includes(scenario)?1:0);
  assert.doesNotMatch(await response.text(),/secret|attacker|sentTo/);
 });
}
