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

for (const scenario of ["anonymous", "foreign", "cancelled", "owned", "email-failure"]) {
  test(`resend ${scenario}: authorization precedes QR signing and delivery`, async () => {
    const signed = [], sent = [];
    let reads = 0;
    const route = loadSource("app/api/tickets/resend/route.ts", {
      ...session(scenario === "anonymous" ? null : "owner@test.cl"),
      "@/lib/db": { pool: { query: async (sql, args) => {
        reads++;
        assert.match(sql, /WHERE t.id = \$1 AND LOWER\(COALESCE/);
        assert.deepEqual(args, ["ticket-1", "owner@test.cl"]);
        return { rows: scenario === "foreign" ? [] : [{
          ticket_id: "ticket-1", ticket_status: scenario === "cancelled" ? "CANCELLED" : "VALID",
          ticket_type_name: "General", order_id: "order-1", buyer_name: "Buyer",
          buyer_email: "original-buyer@test.cl", event_id: "event-1", event_title: "Event",
        }] };
      } } },
      "@/lib/qr-token.server": { signTicketToken: payload => { signed.push(payload); return "signed-token"; } },
      qrcode: { toBuffer: async token => { assert.equal(token, "signed-token"); return Buffer.from("local-png"); } },
      "@/lib/tickets.email": { sendTicketEmail: async args => {
        if (scenario === "email-failure") throw new Error("secret provider failure");
        sent.push(args);
      } },
    });
    const response = await route.POST(new Request("https://ticketchile.test/api/tickets/resend", {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-host": "attacker.test" },
      body: JSON.stringify({ ticketId: "ticket-1", email: "attacker@test.cl", to: ["attacker@test.cl"] }),
    }));
    const expected = { anonymous: 401, foreign: 404, cancelled: 409, owned: 200, "email-failure": 500 };
    assert.equal(response.status, expected[scenario]);
    assert.equal(reads, scenario === "anonymous" ? 0 : 1);
    assert.equal(signed.length, ["owned", "email-failure"].includes(scenario) ? 1 : 0);
    assert.equal(sent.length, scenario === "owned" ? 1 : 0);
    if (scenario === "owned") {
      assert.deepEqual(sent[0].to, ["owner@test.cl"]);
      assert.ok(sent[0].ticket.qrPngBase64);
    }
    assert.doesNotMatch(await response.text(), /secret|original-buyer|attacker/);
  });
}
