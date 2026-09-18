import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSource as loadRawSource } from "./load-source.mjs";
// M1/M2 route contracts isolate rate storage; real atomic limits are covered by security.integration.
const loadSource=(entry,overrides={})=>loadRawSource(entry,{
  "@/lib/event-access.server":{},
  "@/lib/security/rate-limit.server":{limit:async()=>{},publicLimit:async()=>{}},...overrides,
});

const validSession = "a".repeat(64);
const activeAdmin={id:"admin-a",principal_id:"admin-a",kind:"ADMIN",login:"admin",version:1,mfa_verified:true,active:true,verified:true,disabled:false,mfa_enabled:true,mfa_required:true,role:"ADMIN"};
const protectedRoutes = [
  ["admin/events", "GET"], ["admin/event/[id]", "GET"],
  ["admin/organizers", "GET"], ["admin/events/[id]/approve", "POST"],
  ["admin/events/[id]/publish", "POST"], ["admin/events/[id]/unpublish", "POST"],
  ["admin/organizers/[id]/approve", "POST"],
];
const cookieJar = value => ({ cookies: async () => ({ get: name => name === "tc_admin_sess" && value ? { value } : undefined }) });
const forbidden = () => { assert.fail("Unauthenticated request reached protected work"); };

for (const [route, method] of protectedRoutes) {
  for (const [scenario, sid] of [["missing", ""], ["fabricated", "this-cookie-is-long-enough"], ["unknown/revoked/expired", validSession]]) {
    test(`${method} ${route} denies ${scenario} admin session before domain work`, async () => {
      const handler = loadSource(`app/api/${route}/route.ts`, {
        "next/headers": cookieJar(sid),
        "@/lib/db": { pool: {
          query: async (sql, args) => {
            assert.match(sql, /FROM identity_sessions/);
            assert.match(sql, /revoked_at IS NULL/);
            assert.match(sql, /expires_at>NOW\(\)/);
            assert.equal(args[0].length,64);
            assert.notEqual(args[0],sid);
            assert.equal(args[1],"ADMIN");
            return { rows: [], rowCount: 0 };
          }, connect: forbidden,
        } },
        "@/lib/events.admin.server": { adminGetEventDb: forbidden, adminListEventsDb: forbidden, adminSetPublishedDb: forbidden },
      });
      const response = await handler[method](new Request("https://ticketchile.test/api/" + route, { method }), { params: Promise.resolve({ id: "event-b" }) });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
}

test("valid persisted admin can read and publish; browser cross-origin mutation is rejected", async () => {
  const writes = [];
  const overrides = {
    "next/headers": cookieJar(validSession),
    "@/lib/db": { pool: { query: async () => ({ rows: [activeAdmin] }) } },
    "@/lib/events.admin.server": {
      adminListEventsDb: async () => [{ id: "event-a" }],
      adminSetPublishedDb: async (...args) => writes.push(args),
    },
  };
  const list = loadSource("app/api/admin/events/route.ts", overrides);
  const response = await list.GET(new Request("https://ticketchile.test/api/admin/events"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).events[0].id, "event-a");
  const publish = loadSource("app/api/admin/events/[id]/publish/route.ts", overrides);
  const ctx = { params: Promise.resolve({ id: "event-a" }) };
  const request = origin => new Request("https://ticketchile.test/api/admin/events/event-a/publish", { method: "POST", headers: { origin } });
  assert.equal((await publish.POST(request("https://attacker.test"), ctx)).status, 403);
  assert.deepEqual(writes, []);
  assert.equal((await publish.POST(request("https://ticketchile.test"), ctx)).status, 200);
  assert.deepEqual(writes, [["event-a", true,{kind:"ADMIN",id:"admin-a"}]]);
});

test("session store failure returns a generic unavailable response without allowing work", async () => {
  const { requireAdmin } = loadSource("lib/admin-guard.server.ts", {
    "next/headers": cookieJar(validSession),
    "@/lib/db": { pool: { query: async () => { throw new Error("database password secret"); } } },
  });
  const gate = await requireAdmin(new Request("https://ticketchile.test/api/admin/events"));
  assert.equal(gate.ok, false);
  assert.equal(gate.response.status, 503);
  assert.doesNotMatch(await gate.response.text(), /password|secret/);
});

test("approved submission retry is locked and cannot issue another event", async () => {
  const statements = [];
  let released = false;
  const route = loadSource("app/api/admin/events/[id]/approve/route.ts", {
    "next/headers": cookieJar(validSession),
    "@/lib/db": { pool: {
      query: async () => ({ rows: [activeAdmin] }),
      connect: async () => ({
        release: () => { released = true; },
        query: async sql => {
          statements.push(sql);
          if (/SELECT id, organizer_id/.test(sql)) {
            assert.match(sql, /FOR UPDATE/);
            return { rows: [{ id: "submission-a", status: "APPROVED" }] };
          }
          assert.match(sql, /^(BEGIN|ROLLBACK)$/);
          return { rows: [] };
        },
      }),
    } },
  });
  const response = await route.POST(new Request("https://ticketchile.test/api/admin/events/submission-a/approve", { method: "POST" }), { params: Promise.resolve({ id: "submission-a" }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).alreadyApproved, true);
  assert.equal(released, true);
  assert.equal(statements.length, 3);
});

test("admin panel layout rejects a forged cookie and keeps valid session access", async () => {
  for (const authorized of [false, true]) {
    const layout = loadSource("app/(admin)/admin/(panel)/layout.tsx", {
      "next/headers": cookieJar(validSession),
      "next/navigation": { redirect: path => { throw new Error(`redirect:${path}`); } },
      "@/lib/db": { pool: { query: async () => ({ rows: authorized ? [activeAdmin] : [] }) } },
    });
    if (authorized) assert.equal(await layout.default({ children: "protected content" }), "protected content");
    else await assert.rejects(layout.default({ children: "protected content" }), /redirect:\/admin\/login/);
  }
});

test("organizer dashboard derives scope from session and rejects pending accounts", async () => {
  for (const state of ["missing", "unverified", "pending", "approved"]) {
    const scopes = [];
    const route = loadSource("app/api/organizador/dashboard/route.ts", {
      "next/headers": { cookies: async () => ({ get: () => state === "missing" ? undefined : { value: "orgsess_" + "b".repeat(48) } }) },
      "@/lib/organizer-auth.pg.server": { getOrganizerFromSession: async () => ({ id: "organizer-a", verified: state !== "unverified", approved: state === "approved" }) },
      "@/lib/organizer.pg.server": { getOrganizerDashboardStatsPgServerByOrganizer: async id => { scopes.push(id); return {}; } },
    });
    const response = await route.GET();
    assert.equal(response.status, state === "approved" ? 200 : state === "missing" ? 401 : 403);
    assert.deepEqual(scopes, state === "approved" ? ["organizer-a"] : []);
  }
});

test("payment count, aggregates and rows require tenant scope even with another event filter", async () => {
  const calls = [];
  const { getPaymentsDashboardPgServer } = loadSource("lib/organizer.pg.server.ts", {
    "@/lib/db": { pool: { query: async (sql, params) => {
      calls.push({ sql, params });
      assert.match(sql, /event_id IN \(SELECT event_id FROM organizer_events WHERE organizer_id = \$1\)/);
      assert.equal(params[0], "organizer-a");
      return { rows: [], rowCount: 0 };
    } } },
  });
  await assert.rejects(getPaymentsDashboardPgServer({}), /scope is required/);
  assert.equal(calls.length, 0);
  const dashboard = await getPaymentsDashboardPgServer({ organizerId: "organizer-a", eventId: "event-b", q: "buyer-b@test.cl", status: "PAID" });
  assert.equal(calls.length, 3);
  for (const { sql, params } of calls) {
    assert.match(sql, /event_id = \$2/);
    assert.deepEqual(params.slice(0, 3), ["organizer-a", "event-b", "PAID"]);
  }
  assert.equal(dashboard.total, 0);
  assert.equal(dashboard.totals.amountPaidClp, 0);
  assert.deepEqual(dashboard.rows, []);
});

test("organizer dashboard SQL scopes every data query", async () => {
  let calls = 0;
  const { getOrganizerDashboardStatsPgServerByOrganizer } = loadSource("lib/organizer.pg.server.ts", {
    "@/lib/db": { pool: { query: async (sql, params) => {
      calls++;
      assert.match(sql, /organizer_id = \$1/);
      assert.deepEqual(params, ["organizer-a"]);
      return { rows: [], rowCount: 0 };
    } } },
  });
  await getOrganizerDashboardStatsPgServerByOrganizer("organizer-a");
  assert.ok(calls >= 3);
});

test("payments page authenticates before reading and uses session scope for data and event filter", async () => {
  for (const authorized of [false, true]) {
    const calls = [];
    const page = loadSource("app/(organizer)/organizador/pagos/page.tsx", {
      "next/navigation": { redirect: path => { throw new Error(`redirect:${path}`); } },
      "@/lib/organizer-guard.server": { requireOrganizerApproved: async () => authorized ? { ok: true, organizerId: "organizer-a" } : { ok: false, status: 401 } },
      "@/lib/organizer.pg.server": {
        listOrganizerEventsPgServer: async id => { calls.push(id); return []; },
        getPaymentsDashboardPgServer: async args => {
          calls.push(args.organizerId);
          assert.equal(args.eventId, "event-b");
          return { total: 0, totals: {}, rows: [] };
        },
      },
    });
    const props = { searchParams: Promise.resolve({ eventId: "event-b", organizerId: "organizer-b" }) };
    if (authorized) {
      await page.default(props);
      assert.deepEqual(calls, ["organizer-a", "organizer-a"]);
    } else {
      await assert.rejects(page.default(props), /redirect:\/organizador\/login/);
      assert.deepEqual(calls, []);
    }
  }
});
