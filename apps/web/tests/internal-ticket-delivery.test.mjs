import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSource as loadRawSource } from "./load-source.mjs";
// M1/M2 route contracts isolate rate storage; real atomic limits are covered by security.integration.
const loadSource=(entry,overrides={})=>loadRawSource(entry,{
  "@/lib/security/rate-limit.server":{limit:async()=>{},publicLimit:async()=>{}},...overrides,
});

for (const scenario of ["no-paid-claim", "owner-changed", "deliver", "email-failed"]) {
  test(`internal paid delivery: ${scenario}, persisted owner and local QR only`, async () => {
    let rendered = 0, sent = 0, released = 0;
    const service = loadSource("lib/paid-ticket-delivery.server.ts", {
      "@/lib/buyer-guard.server": { TICKET_OWNER_SQL: "CURRENT_OWNER" },
      "@/lib/db": { pool: { query: async (sql, args) => {
        if (sql.includes("information_schema")) return { rows: [{ count: 2 }] };
        if (sql.startsWith("UPDATE tickets SET emailed_at=NULL")) {
          released++; assert.deepEqual(args, ["ticket_1", "order_1"]); return { rows: [] };
        }
        assert.match(sql, /p.hold_id=o.hold_id AND p.status='PAID'/);
        assert.match(sql, /t.status='VALID'/);
        if (sql.startsWith("UPDATE tickets t")) {
          assert.match(sql, /emailed_to=CURRENT_OWNER/);
          assert.deepEqual(args, ["order_1"]);
          return { rows: scenario === "no-paid-claim" ? [] : [{ id: "ticket_1" }] };
        }
        assert.match(sql, /t.emailed_to=CURRENT_OWNER/);
        assert.deepEqual(args, ["ticket_1", "order_1"]);
        return { rows: scenario === "owner-changed" ? [] : [{ id: "ticket_1", event_id: "event_1",
          recipient: "new-owner@test.cl", buyer_email: "original@test.cl", status: "VALID", ticket_type_name: "General",
          buyer_name: "Test", event_title: "Event", city: "Santiago", venue: "Test", date_iso: "2026-09-18T19:00:00Z" }] };
      } } },
      "@/lib/qr-render.server": { renderTicketQr: async ticket => {
        rendered++; assert.equal(ticket.recipient, "new-owner@test.cl"); return Buffer.from("local-png");
      } },
      "@/lib/tickets.email": { sendTicketEmail: async args => {
        sent++; assert.deepEqual(args.to, ["new-owner@test.cl"]);
        assert.equal(args.ticket.qrPngBase64, Buffer.from("local-png").toString("base64"));
        if (scenario === "email-failed") throw new Error("email unavailable");
      } },
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => assert.fail("Internal ticket delivery must not fetch a public QR endpoint");
    try { await service.deliverPaidOrder("order_1"); } finally { globalThis.fetch = originalFetch; }
    assert.equal(rendered, ["deliver", "email-failed"].includes(scenario) ? 1 : 0);
    assert.equal(sent, rendered);
    assert.equal(released, ["owner-changed", "email-failed"].includes(scenario) ? 1 : 0);
  });
}

for (const scenario of ["paid", "mismatched-amount", "mismatched-session", "mismatched-order", "mismatched-currency"]) {
  test(`Stripe buyer status: ${scenario} verifies stored evidence and filters transferred tickets`, async () => {
    let mutations = 0, ticketReads = 0, delivered = 0;
    const payment = { id: "pay_1", hold_id: "hold_1", order_id: null, provider: "stripe", provider_ref: "cs_1",
      amount_clp: 1000, currency: "CLP", owner_email: "owner@test.cl", buyer_email: "recipient@test.cl", status: "PENDING" };
    const { buyerPaymentStatus } = loadSource("lib/payment-status.server.ts", {
      "@/lib/buyer-guard.server": { TICKET_OWNER_SQL: "CURRENT_TICKET_OWNER" },
      "@/lib/db": {
        pool: { query: async () => ({ rows: [{ ...payment }] }) },
        withTx: async fn => fn({ query: async (sql, args) => {
          if (sql.startsWith("SELECT *")) return { rows: [{ ...payment }] };
          if (sql.startsWith("UPDATE payments")) { mutations++; return { rows: [] }; }
          if (sql.startsWith("SELECT id FROM orders")) return { rows: [{ id: "order_1" }] };
          ticketReads++; assert.match(sql, /o.id=\$1 AND CURRENT_TICKET_OWNER=\$2/);
          assert.deepEqual(args, ["order_1", "owner@test.cl"]); return { rows: [{ id: "ticket_still_owned" }] };
        } }),
      },
      "@/lib/stripe.server": { stripe: { checkout: { sessions: { retrieve: async id => {
        assert.equal(id, "cs_1"); return { id: scenario === "mismatched-session" ? "cs_other" : id,
          amount_total: scenario === "mismatched-amount" ? 1 : 1000, currency: scenario === "mismatched-currency" ? "usd" : "clp",
          metadata: { paymentId: scenario === "mismatched-order" ? "pay_other" : "pay_1" }, payment_status: "paid" };
      } } } } },
      "@/lib/checkout.pg.server": { finalizePaidHoldToOrderPgTx: () => assert.fail("Existing order must not be reissued") },
      "@/lib/paid-ticket-delivery.server": { deliverPaidOrder: async id => { delivered++; assert.equal(id, "order_1"); } },
    });
    if (scenario === "paid") {
      const result = await buyerPaymentStatus("owner@test.cl", { provider: "stripe", token: "cs_1" }, true);
      assert.equal(result.payment.status, "PAID");
      assert.deepEqual(result.tickets, [{ id: "ticket_still_owned" }]);
    } else await assert.rejects(() => buyerPaymentStatus("owner@test.cl", { provider: "stripe", token: "cs_1" }, true), error => error.status === 409);
    assert.equal(mutations, scenario === "paid" ? 1 : 0);
    assert.equal(ticketReads, mutations); assert.equal(delivered, mutations);
  });
}
