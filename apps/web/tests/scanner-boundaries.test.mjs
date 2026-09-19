import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSource as loadRawSource } from "./load-source.mjs";
const sharedAccess=loadRawSource("lib/access.server.ts");
// M1/M2 route contracts isolate rate storage; real atomic limits are covered by security.integration.
const loadSource=(entry,overrides={})=>{
  const db=overrides["@/lib/db"];
  if(db?.pool?.query&&!db.withTx)db.withTx=fn=>fn(db.pool);
  return loadRawSource(entry,{
  "@/lib/access.server":sharedAccess,
  "@/lib/security/rate-limit.server":{limit:async()=>{},publicLimit:async()=>{}},...overrides,
});};

function auth(scenario) {
  return {"@/lib/security/capabilities.server":{organizerActor:async()=>{
    if(["anonymous","forged","unverified","pending"].includes(scenario)) {
      const {AccessError}=sharedAccess;
      throw new AccessError(["anonymous","forged"].includes(scenario)?401:403,"NOT_AUTHORIZED","No autorizado.");
    }
    return {kind:"ORGANIZER",id:"org_1",version:1};
  }}};
}
const event = { organizer_id:"org_1", id: "event_1", title: "Database event", slug: "database-event", city: "Santiago", venue: "Test" };
function eventQuery(sql, args, scenario) {
  assert.match(sql, /JOIN organizer_events/);
  assert.match(sql, /security_can_event\(\$2,\$3,\$4,e.id,\$5\)/);
  assert.deepEqual(args.slice(0,4), ["event_1", "ORGANIZER", "org_1",1]);
  assert.ok(["scanner.read","scanner.checkin","attendees.export"].includes(args[4]));
  return { rows: scenario === "foreign" ? [] : [event] };
}
for (const endpoint of ["scanner/checkin", "demo/checkin"]) {
  for (const scenario of ["anonymous", "forged", "unverified", "pending", "foreign", "owned", "duplicate", "cancelled", "missing", "wrong-event", "invalid-with-manual", "manual", "cross-origin"]) {
    test(`${endpoint}: ${scenario}`, async () => {
      let eventReads = 0, writes = 0;
      const route = loadSource(`app/api/${endpoint}/route.ts`, {
        ...auth(scenario),
        "@/lib/qr-token.server": { verifyTicketToken: () => scenario === "invalid-with-manual" ? null : {
          ticketId: "tkt_1", eventId: scenario === "wrong-event" ? "event_2" : event.id,
        } },
        "@/lib/db": { pool: { query: async (sql, args) => {
          if (sql.includes("pg_advisory_xact_lock")) return {rows:[]};
          if (sql.includes("JOIN organizer_events")) { eventReads++; return eventQuery(sql, args, scenario); }
          assert.match(sql, /t.event_id=\$2/);
          assert.match(sql, /security_can_event\(\$3,\$4,\$5,t.event_id,'scanner.checkin'\)/);
          assert.deepEqual(args, ["tkt_1", "event_1", "ORGANIZER", "org_1",1]);
          if (sql.startsWith("UPDATE")) {
            writes++; assert.match(sql, /t.status='VALID'/);
            return { rows: ["owned", "manual"].includes(scenario) ? [{ id: "tkt_1", ticket_type_name: "General", status: "USED", used_at: new Date() }] : [] };
          }
          return { rows: scenario === "missing" ? [] : [{ id: "tkt_1", status: scenario === "duplicate" ? "USED" : "CANCELLED" }] };
        } } },
      });
      const response = await route.POST(new Request(`https://ticketchile.test/api/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json", Origin: scenario === "cross-origin" ? "https://attacker.test" : "https://ticketchile.test" },
        body: JSON.stringify({ eventId: event.id, qrText: scenario === "manual" ? "" : "tc1.test", ticketId: ["manual", "invalid-with-manual"].includes(scenario) ? "tkt_1" : undefined,
          role: "staff", organizerId: "org_1", eventCode: "unrestricted-code" }),
      }));
      const expected = { anonymous: 401, forged: 401, unverified: 403, pending: 403, foreign: 404, owned: 200, duplicate: 409,
        cancelled: 409, missing: 404, "wrong-event": 409, "invalid-with-manual": 400, manual: 200, "cross-origin": 403 };
      assert.equal(response.status, expected[scenario]);
      assert.equal(eventReads, ["anonymous", "forged", "unverified", "pending", "cross-origin"].includes(scenario) ? 0 : 1);
      assert.equal(writes, ["owned", "manual", "duplicate", "cancelled", "missing"].includes(scenario) ? 1 : 0);
      assert.doesNotMatch(await response.text(), /buyerEmail|buyer_email|@/);
    });
  }
}

for (const prefix of ["scanner", "demo"]) {
  for (const endpoint of ["event-stats", "event-checkins", "export", "export-checkins"]) {
    for (const scenario of ["anonymous", "forged", "foreign", "owned"]) {
      test(`${prefix}/${endpoint}: ${scenario} always uses event and organizer scope`, async () => {
        let reads = 0;
        const route = loadSource(`app/api/${prefix}/${endpoint}/route.ts`, {
          ...auth(scenario), "@/lib/db": { pool: { query: async (sql, args) => {
            if (sql.includes("pg_advisory_xact_lock")) return {rows:[]};
          if (sql.includes("JOIN organizer_events")) return eventQuery(sql, args, scenario);
            reads++;
            assert.match(sql, /event_id=\$1/);
            assert.match(sql, /security_can_event\(\$2,\$3,\$4/);
            assert.deepEqual(args.slice(0, 4), ["event_1", "ORGANIZER", "org_1",1]);
            return { rows: [] };
          } } },
        });
        const response = await route.GET(new Request(`https://ticketchile.test/api/${prefix}/${endpoint}?eventId=event_1&organizerId=org_2&secret=legacy-export-secret`));
        assert.equal(response.status, { anonymous: 401, forged: 401, foreign: 404, owned: 200 }[scenario]);
        assert.equal(reads, scenario === "owned" ? 1 : 0);
        assert.match(response.headers.get("cache-control"), /no-store/);
      });
    }
  }
}

test("CSV escapes spreadsheet formulas, whitespace prefixes and quotes", () => {
  const { csvEscapeCell } = loadSource("lib/event-export.server.ts", { "@/lib/db": {}, "@/lib/event-access.server": {} });
  for (const value of ["=cmd()", "+SUM(1)", "-1+cmd()", "@x", "  =x", "\tx"]) assert.match(csvEscapeCell(value), /^'?"?'|^'/);
  assert.equal(csvEscapeCell('a,"b"'), '"a,""b"""');
  assert.equal(csvEscapeCell("Normal attendee"), "Normal attendee");
});

for (const endpoint of ["reset", "reset-checkins", "paid-order", "cart-hold", "cart-hold/release", "stats"]) {
  test(`retired demo/${endpoint} has no database or fixture mutations`, async () => {
    const route = loadSource(`app/api/demo/${endpoint}/route.ts`);
    const response = await (route.POST || route.GET)(new Request(`https://ticketchile.test/api/demo/${endpoint}`));
    assert.equal(response.status, 410);
  });
}

test("HTTP seed remains unavailable in production before invoking the seeder", async () => {
  const route = loadSource("app/api/dev/seed/route.ts", {
    "@/lib/seed.pg.server": { seedFromEvents: () => assert.fail("Production cannot seed fixtures") },
  });
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try { assert.equal((await route.POST()).status, 403); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

for (const scenario of ["foreign", "owned"]) {
  test(`scanner page resolves ${scenario} event from the database`, async () => {
    const page = loadSource("app/(organizer)/organizador/(panel)/eventos/[id]/scanner/page.tsx", {
      ...auth(scenario), "./ui": { default: () => null },
      "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
      "@/lib/db": { pool: { query: async (sql, args) => eventQuery(sql, args, scenario) } },
    });
    const render = () => page.default({ params: Promise.resolve({ id: event.id }) });
    if (scenario === "foreign") await assert.rejects(render, /NOT_FOUND/);
    else {
      const element = await render();
      assert.equal(element.props.eventId, event.id);
      assert.equal(element.props.eventTitle, "Database event");
    }
  });
}
