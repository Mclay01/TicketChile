import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSource as loadRawSource } from "./load-source.mjs";
// M1/M2 route contracts isolate rate storage; real atomic limits are covered by security.integration.
const loadSource=(entry,overrides={})=>loadRawSource(entry,{
  "@/lib/security/rate-limit.server":{limit:async()=>{},publicLimit:async()=>{}},...overrides,
});

const ticket = { id: "tkt_1", event_id: "event_1", order_id: "order_1", status: "VALID",
  ticket_type_name: "General", event_title: "Test event", city: "Santiago", venue: "Test" };

for (const endpoint of ["qr", "demo/qr", "wallet/google/save-url"]) {
  for (const scenario of ["anonymous", "foreign", "owned", "USED", "CANCELLED", "foreign-token", "tampered-token", "conflicting-event"]) {
    test(`${endpoint}: ${scenario} cannot bypass current ownership`, async () => {
      let reads = 0, signs = 0;
      const route = loadSource(`app/api/${endpoint}/route.ts`, {
        "@/lib/buyer-guard.server": { getBuyerEmail: async () => scenario === "anonymous" ? "" : "owner@test.cl",
          TICKET_OWNER_SQL: "CURRENT_OWNER" },
        "@/lib/db": { pool: { query: async (sql, args) => {
          reads++;
          assert.match(sql, /CURRENT_OWNER = \$2/);
          assert.match(sql, /t.event_id = \$3/);
          assert.equal(args[0], ticket.id);
          assert.equal(args[1], "owner@test.cl");
          return { rows: scenario.startsWith("foreign") ? [] : [{ ...ticket,
            status: ["USED", "CANCELLED"].includes(scenario) ? scenario : "VALID" }] };
        } } },
        "@/lib/qr-token.server": {
          verifyTicketToken: () => scenario === "tampered-token" ? null : { ticketId: ticket.id, eventId: ticket.event_id },
          signTicketToken: value => { signs++; assert.deepEqual(value, { ticketId: ticket.id, eventId: ticket.event_id }); return "tc1.signed"; },
        },
        "@/lib/stripe.server": { appBaseUrl: () => "https://ticketchile.test" },
        qrcode: { toBuffer: async value => { assert.equal(value, "tc1.signed"); return Buffer.from("png"); } },
        jsonwebtoken: { sign: claims => {
          assert.equal(claims.payload.eventTicketObjects[0].barcode.value, "tc1.signed");
          assert.doesNotMatch(JSON.stringify(claims), /attacker|TICKET:|buyerEmail/);
          return "fake-wallet-jwt";
        } },
      });
      const previous = {};
      for (const key of ["GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL", "GOOGLE_WALLET_PRIVATE_KEY"]) {
        previous[key] = process.env[key]; process.env[key] = "test-only";
      }
      try {
        const params = new URLSearchParams({ ticket_id: ticket.id, format: "json", buyerEmail: "attacker@test.cl" });
        if (scenario.includes("token") || scenario === "conflicting-event") params.set("t", "test-token");
        if (scenario === "conflicting-event") params.set("eventId", "event_other");
        const response = await route.GET(new Request(`https://ticketchile.test/api/${endpoint}?${params}`));
        const expected = { anonymous: 401, foreign: 404, owned: 200, USED: 409, CANCELLED: 409,
          "foreign-token": 404, "tampered-token": 400, "conflicting-event": 400 };
        assert.equal(response.status, expected[scenario]);
        assert.match(response.headers.get("cache-control"), /private, no-store/);
        assert.equal(signs, scenario === "owned" ? 1 : 0);
        assert.equal(reads, ["anonymous", "tampered-token", "conflicting-event"].includes(scenario) ? 0 : 1);
      } finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
      }
    });
  }
}

test("existing HMAC primitive rejects changes to ticket/event/signature", () => {
  const previous = process.env.TICKETCHILE_QR_SECRET;
  process.env.TICKETCHILE_QR_SECRET = "unit-test-only-qr-secret-never-production";
  try {
    const qr = loadSource("lib/qr-token.server.ts");
    const signed = qr.signTicketToken({ ticketId: "tkt_1", eventId: "event_1" });
    assert.equal(qr.verifyTicketToken(signed).ticketId, "tkt_1");
    for (const value of [signed.replace("tkt_1", "tkt_2"), signed.replace("event_1", "event_2"), signed + "x", "TICKET:tkt_1", ""]) {
      assert.equal(qr.verifyTicketToken(value), null);
    }
  } finally { if (previous === undefined) delete process.env.TICKETCHILE_QR_SECRET; else process.env.TICKETCHILE_QR_SECRET = previous; }
});
