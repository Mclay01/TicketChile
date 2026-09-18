import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSource as loadRawSource } from "./load-source.mjs";
// M1/M2 route contracts isolate rate storage; real atomic limits are covered by security.integration.
const loadSource=(entry,overrides={})=>loadRawSource(entry,{
  "@/lib/payments/reconcile.server":{reconcilePayment:()=>assert.fail("Pending or foreign payment must not reconcile")},
  "@/lib/payments/adapters.server":{},
  "@/lib/security/rate-limit.server":{limit:async()=>{},publicLimit:async()=>{}},...overrides,
});

const payment = { id: "pay_1", hold_id: "hold_1", order_id: null, event_id: "event_1", provider: "flow",
  provider_ref: "stored-token", owner_email: "owner@test.cl", buyer_email: "recipient@test.cl",
  buyer_name: "Buyer", event_title: "Test", amount_clp: 1000, currency: "CLP", status: "PENDING" };
const buyerMock = email => ({ getBuyerEmail: async () => email, TICKET_OWNER_SQL: "CURRENT_TICKET_OWNER" });

for (const [endpoint, query] of [["status", "payment_id=pay_1"], ["stripe/status", "session_id=cs_test_1"], ["stripe/status", "sessionId=cs_test_1"], ["flow/status", "token=stored-token"]]) {
  for (const scenario of ["anonymous", "foreign", "owned", "scope-revoked"]) {
    test(`payments/${endpoint}?${query}: ${scenario}`, async () => {
      let reads = 0, transactions = 0;
      const route = loadSource(`app/api/payments/${endpoint}/route.ts`, {
        "@/lib/buyer-guard.server": buyerMock(scenario === "anonymous" ? "" : "owner@test.cl"),
        "@/lib/db": {
          pool: { query: async (sql, args) => {
            reads++;
            assert.match(sql, /NULLIF\(BTRIM\(owner_email\)/);
            assert.equal(args[0], "owner@test.cl");
            assert.equal(args[1], endpoint === "status" ? "pay_1" : null);
            assert.equal(args[2], endpoint === "status" ? null : endpoint.split("/")[0]);
            assert.equal(args[3], endpoint === "status" ? null : endpoint.startsWith("stripe") ? "cs_test_1" : "stored-token");
            return { rows: scenario === "foreign" ? [] : [{ ...payment }] };
          } },
          withTx: async fn => { transactions++; return fn({ query: async (sql, args) => {
            assert.match(sql, /FOR UPDATE/); assert.match(sql, /NULLIF\(BTRIM\(owner_email\)/);
            assert.deepEqual(args, ["pay_1", "owner@test.cl"]);
            return { rows: scenario === "scope-revoked" ? [] : [{ ...payment }] };
          } }); },
        },
        "@/lib/stripe.server": { stripe: { checkout: { sessions: { retrieve: () => assert.fail("Provider must not be called for this payment") } } } },
        "@/lib/paid-ticket-delivery.server": { deliverPaidOrder: () => assert.fail("Pending/foreign payment must not deliver") },
      });
      const response = await route.GET(new Request(`https://ticketchile.test/api/payments/${endpoint}?${query}&ownerEmail=owner@test.cl`));
      assert.equal(response.status, { anonymous: 401, foreign: 404, owned: 200, "scope-revoked": 404 }[scenario]);
      assert.equal(reads, scenario === "anonymous" ? 0 : 1);
      assert.equal(transactions, ["owned", "scope-revoked"].includes(scenario) ? 1 : 0);
      assert.match(response.headers.get("cache-control"), /private, no-store/);
      if (scenario !== "owned") assert.doesNotMatch(await response.text(), /recipient|Buyer|hold_1/);
    });
  }
}

for (const endpoint of ["confirm", "webhook"]) {
  for (const method of ["GET", "POST"]) {
    test(`Flow ${endpoint} ${method}: provider callback returns no buyer data and verifies supplied signature`, async () => {
      let reconciled = 0;
      const route = loadSource(`app/api/payments/flow/${endpoint}/route.ts`, {
        "@/lib/flow": { flowVerifyWebhookSignature: () => false },
        "@/lib/flow-reconcile.server": { reconcileFlow: async token => { reconciled++; assert.equal(token, "stored-token"); return { paymentId: "pay_1", buyerEmail: "private@test.cl" }; } },
      });
      for (const signature of ["", "&s=forged"]) {
        const body = `token=stored-token${signature}`;
        const req = new Request(`https://ticketchile.test/api/payments/flow/${endpoint}${method === "GET" ? `?${body}` : ""}`,
          { method, ...(method === "POST" ? { body } : {}) });
        const response = await route[method](req);
        assert.equal(response.status, signature ? 403 : 200);
        assert.doesNotMatch(await response.text(), /pay_1|private/);
      }
      assert.equal(reconciled, 1);
    });
  }
}

for (const endpoint of ["kick", "return"]) {
  test(`Flow ${endpoint} browser return only navigates; JSON kick requires buyer session`, async () => {
    const route = loadSource(`app/api/payments/flow/${endpoint}/route.ts`, {
      "@/lib/buyer-guard.server": buyerMock(""), "@/lib/db": { pool: { query: () => assert.fail("Anonymous navigation must not query") } },
      "@/lib/flow-reconcile.server": { reconcileFlow: () => assert.fail("Anonymous return must not mutate") },
    });
    const formResponse = await route.POST(new Request("https://ticketchile.test/api/payments/flow/return?payment_id=pay_other", {
      method: "POST", body: new URLSearchParams({ token: "stored-token" }),
    }));
    assert.equal(formResponse.status, 303);
    assert.equal(formResponse.headers.get("location"), "https://ticketchile.test/api/payments/flow/kick?token=stored-token");
    const getResponse = await route.GET(new Request(formResponse.headers.get("location")));
    assert.match(getResponse.headers.get("location"), /\/signin\?callbackUrl=/);
    const jsonResponse = await route.POST(new Request("https://ticketchile.test/api/payments/flow/kick", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "stored-token", paymentId: "pay_1" }),
    }));
    assert.equal(jsonResponse.status, 401);
  });
}

for (const provider of ["stripe", "transfer", "webpay", "flow"]) {
  test(`${provider} creation requires session before configuration/database/provider work`, async () => {
    const route = loadSource(`app/api/payments/${provider}/create/route.ts`, {
      "@/lib/buyer-guard.server": buyerMock(""), "@/lib/db": { pool: { connect: () => assert.fail("Anonymous create must not connect") } },
      "@/lib/stripe.server": {}, "@/lib/flow": {}, "transbank-sdk": {},
    });
    const response = await route.POST(new Request(`https://ticketchile.test/api/payments/${provider}/create`, {
      method: "POST", body: JSON.stringify({ ownerEmail: "owner@test.cl", holdId: "hold_1" }),
    }));
    assert.equal(response.status, 401);
  });
}

test("payment retry cannot reassign existing owner or switch providers", async () => {
  const { checkPaymentRetry } = loadSource("lib/payment-create-access.server.ts", { "@/lib/ticket-access.server": {} });
  const client = { query: async (sql, args) => {
    if(sql.includes("FROM holds")){
      assert.match(sql,/owner_email=\$2 FOR UPDATE/);assert.equal(args[0],"hold_1");
      return {rowCount:args[1]==="owner@test.cl"?1:0,rows:[]};
    }
    assert.match(sql, /hold_id=\$1 FOR UPDATE/); assert.deepEqual(args, ["hold_1"]); return { rows: [payment] };
  } };
  await assert.rejects(() => checkPaymentRetry(client, "hold_1", "attacker@test.cl", "flow"), error => error.status === 404);
  await assert.rejects(() => checkPaymentRetry(client, "hold_1", "owner@test.cl", "transfer"), error => error.status === 404);
  await checkPaymentRetry(client, "hold_1", "owner@test.cl", "flow");
});
