import "server-only";
import { pool, withTx } from "@/lib/db";
import { flowGetStatus } from "@/lib/flow";
import { ownedPayment, type PaymentRow } from "@/lib/payment-access.server";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";
import { deliverPaidOrder } from "@/lib/paid-ticket-delivery.server";
import { AccessError } from "@/lib/access.server";

/** Buyer-initiated reconciliation uses email scope. Provider callbacks have no
 * buyer cookie: their authority is the independently retrieved provider result,
 * bound to the stored provider/token/commerce order/amount/currency. */
export async function reconcileFlow(token: string, buyer?: { email: string; paymentId?: string }) {
  if (!token || token.length > 512) throw new AccessError(400, "INVALID_INPUT", "Token inválido.");
  const known = buyer ? await ownedPayment(buyer.email, { id: buyer.paymentId, provider: "flow", token })
    : (await pool.query<PaymentRow>(`SELECT * FROM payments WHERE provider='flow' AND provider_ref=$1 LIMIT 1`, [token])).rows[0];
  if (!known) throw new AccessError(404, "NOT_FOUND", "Pago no encontrado.");
  const provider = await flowGetStatus(token);
  if (provider.commerceOrder !== known.id || Number(provider.amount) !== Number(known.amount_clp) ||
      provider.currency?.toUpperCase() !== known.currency.toUpperCase()) {
    throw new AccessError(409, "PAYMENT_MISMATCH", "No se pudo verificar el pago.");
  }
  const states: Record<number, string> = { 1: "PENDING", 2: "PAID", 3: "FAILED", 4: "CANCELLED" };
  const nextStatus = states[Number(provider.status)];
  if (!nextStatus) throw new AccessError(409, "PAYMENT_MISMATCH", "Estado de pago inválido.");
  const outcome = await withTx(async client => {
    const result = await client.query<PaymentRow>(
      `SELECT * FROM payments WHERE id=$1 AND provider='flow' AND provider_ref=$2 FOR UPDATE`, [known.id, token],
    );
    const payment = result.rows[0];
    if (!payment || Number(payment.amount_clp) !== Number(provider.amount) || payment.currency.toUpperCase() !== provider.currency.toUpperCase() ||
        (buyer && (payment.owner_email?.trim() || payment.buyer_email?.trim()).toLowerCase() !== buyer.email)) {
      throw new AccessError(409, "PAYMENT_MISMATCH", "No se pudo verificar el pago.");
    }
    const status = payment.status === "PAID" ? "PAID" : nextStatus;
    await client.query(`UPDATE payments SET status=$2, paid_at=CASE WHEN $2='PAID' THEN COALESCE(paid_at,NOW()) ELSE paid_at END, updated_at=NOW() WHERE id=$1`, [payment.id, status]);
    let orderId = payment.order_id || "";
    if (status === "PAID" && !orderId) {
      await finalizePaidHoldToOrderPgTx(client, { holdId: payment.hold_id, paymentId: payment.id,
        eventTitle: payment.event_title, buyerName: payment.buyer_name, buyerEmail: payment.buyer_email });
      const order = await client.query<{ id: string }>(`SELECT id FROM orders WHERE hold_id=$1`, [payment.hold_id]);
      orderId = order.rows[0]?.id || "";
    } else if (status === "FAILED" || status === "CANCELLED") {
      // Claim only an ACTIVE hold: replayed callbacks cannot release it twice.
      const expired = await client.query(`UPDATE holds SET status='EXPIRED' WHERE id=$1 AND status='ACTIVE' RETURNING id`, [payment.hold_id]);
      if (expired.rowCount) await client.query(
        `UPDATE ticket_types tt SET held=GREATEST(0,tt.held-hi.qty) FROM hold_items hi
         WHERE hi.hold_id=$1 AND tt.event_id=hi.event_id AND tt.id=hi.ticket_type_id`, [payment.hold_id],
      );
    }
    return { paymentId: payment.id, localStatus: status, orderId };
  });
  if (outcome.localStatus === "PAID" && outcome.orderId) await deliverPaidOrder(outcome.orderId).catch(() => undefined);
  return outcome;
}
